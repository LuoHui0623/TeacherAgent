"""无状态 ChatModel：统一 provider 调用、限流和运行记录。"""

from collections.abc import Iterator
from typing import Any, cast

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult

from teacheragent.shared.llm_contracts import PromptTrace
from teacheragent.infrastructure.llm.client import extract_usage
from teacheragent.infrastructure.llm.recorder import RunRecorder
from teacheragent.infrastructure.llm.runtime import LlmRuntime, TaskRuntimeContext
from teacheragent.config.llm import LlmSettings


class LlmModel:
    """所有 LLM 模型包装器的基础抽象。"""


class ChatModel(LlmModel):
    """可复用但不保存调用级上下文的对话模型包装器。"""

    def __init__(self, model: Any, *, runtime: LlmRuntime, settings: LlmSettings,
                 recorder: RunRecorder | None = None) -> None:
        self._model = model
        self._runtime = runtime
        self._settings = settings
        self._recorder = recorder or RunRecorder()

    def invoke(self, messages: list[dict[str, Any]], *, task_context: TaskRuntimeContext,
               prompt_trace: PromptTrace | None = None, sequence: int = 1,
               attempt: int = 1) -> Any:
        trace = prompt_trace or PromptTrace(messages=messages, sources=[], template_text="")
        request = self._runtime.new_request(task_context, trace, sequence=sequence, attempt=attempt)
        with self._runtime.acquire(self._settings):
            with self._recorder.record(request, role=self._settings["role"],
                                       provider=self._settings["provider"], model=self._settings["model"],
                                       temperature=self._settings["temperature"]) as handle:
                response = self._model.invoke(messages)
                handle.output_message = _message_dict(response)
                handle.usage = extract_usage(response)
                return response

    def stream(self, messages: list[dict[str, Any]], *, task_context: TaskRuntimeContext,
               prompt_trace: PromptTrace | None = None, sequence: int = 1,
               attempt: int = 1) -> Iterator[Any]:
        trace = prompt_trace or PromptTrace(messages=messages, sources=[], template_text="")
        request = self._runtime.new_request(task_context, trace, sequence=sequence, attempt=attempt)
        with self._runtime.acquire(self._settings):
            with self._recorder.record(request, role=self._settings["role"],
                                       provider=self._settings["provider"], model=self._settings["model"],
                                       temperature=self._settings["temperature"]) as handle:
                for chunk in self._model.stream(messages):
                    handle.output_message = _message_dict(chunk)
                    handle.usage = extract_usage(chunk)
                    yield chunk

    async def ainvoke(self, messages: list[dict[str, Any]], *, task_context: TaskRuntimeContext,
                      prompt_trace: PromptTrace | None = None, sequence: int = 1,
                      attempt: int = 1) -> Any:
        trace = prompt_trace or PromptTrace(messages=messages, sources=[], template_text="")
        request = self._runtime.new_request(task_context, trace, sequence=sequence, attempt=attempt)
        with self._runtime.acquire(self._settings):
            with self._recorder.record(request, role=self._settings["role"],
                                       provider=self._settings["provider"], model=self._settings["model"],
                                       temperature=self._settings["temperature"]) as handle:
                response = await self._model.ainvoke(messages)
                handle.output_message = _message_dict(response)
                handle.usage = extract_usage(response)
                return response


class TracedChatModel(BaseChatModel):
    """将 LangChain 模型节点转发到逐请求记录边界。"""

    wrapped: Any
    runtime: LlmRuntime
    settings: LlmSettings
    prompt_trace: PromptTrace
    default_context: TaskRuntimeContext

    @property
    def _llm_type(self) -> str:
        return "teacheragent-traced-chat"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "TracedChatModel":
        return TracedChatModel(
            wrapped=self.wrapped.bind_tools(tools, **kwargs),
            runtime=self.runtime,
            settings=self.settings,
            prompt_trace=self.prompt_trace,
            default_context=self.default_context,
        )

    def _generate(self, messages: list[BaseMessage], stop: list[str] | None = None,
                  run_manager: Any = None, **kwargs: Any) -> ChatResult:
        response = ChatModel(self.wrapped, runtime=self.runtime, settings=self.settings).invoke(
            _message_dicts(messages), task_context=self.default_context,
            prompt_trace=self.prompt_trace,
        )
        message = response if isinstance(response, AIMessage) else AIMessage(content=getattr(response, "content", str(response)))
        return ChatResult(generations=[ChatGeneration(message=message)])

    def _stream(self, messages: list[BaseMessage], stop: list[str] | None = None,
                run_manager: Any = None, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        for chunk in ChatModel(self.wrapped, runtime=self.runtime, settings=self.settings).stream(
            _message_dicts(messages), task_context=self.default_context,
            prompt_trace=self.prompt_trace,
        ):
            message = chunk if isinstance(chunk, AIMessageChunk) else AIMessageChunk(content=getattr(chunk, "content", str(chunk)))
            yield ChatGenerationChunk(message=message)

    async def _agenerate(self, messages: list[BaseMessage], stop: list[str] | None = None,
                         run_manager: Any = None, **kwargs: Any) -> ChatResult:
        response = await ChatModel(self.wrapped, runtime=self.runtime, settings=self.settings).ainvoke(
            _message_dicts(messages), task_context=self.default_context,
            prompt_trace=self.prompt_trace,
        )
        message = response if isinstance(response, AIMessage) else AIMessage(content=getattr(response, "content", str(response)))
        return ChatResult(generations=[ChatGeneration(message=message)])

def _message_dict(response: Any) -> dict[str, Any]:
    if hasattr(response, "model_dump"):
        value = response.model_dump()
        if isinstance(value, dict):
            return cast(dict[str, Any], value)
        return {"content": str(response)}
    return {"content": getattr(response, "content", str(response))}


def _message_dicts(messages: list[BaseMessage]) -> list[dict[str, Any]]:
    return [{"role": message.type, "content": message.content} for message in messages]