"""唯一 LLM 模型外观：统一 provider 调用、重试、限流与运行记录。"""

from collections.abc import AsyncIterator, Awaitable, Callable, Generator, Iterator
from contextlib import contextmanager
from typing import Any, cast

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.runnables import Runnable, RunnableLambda
from pydantic import PrivateAttr

from teacheragent.capabilities.llm.contracts import LlmMessages
from teacheragent.config.llm import LlmSettings
from teacheragent.infrastructure.llm.client import extract_usage
from teacheragent.infrastructure.llm.recorder import RunHandle, RunRecorder
from teacheragent.infrastructure.llm.runtime import LlmRuntime, PendingRequest, TaskRuntimeContext

# 一次逻辑请求的最大尝试次数；不做配置化。
RETRY_ATTEMPTS = 3 

# 重试条件：按异常类型筛选；需要收窄时只改这里
RETRY_EXCEPTION_TYPES: tuple[type[BaseException], ...] = (Exception,)

# 重试退避参数，与 `with_retry` 默认一致；测试可置 0 以避免等待。
RETRY_WAIT_INITIAL = 1.0
RETRY_WAIT_MAX = 10.0
RETRY_WAIT_JITTER = 1.0


class LlmModel(BaseChatModel):
    """项目唯一的模型外观：继承 LangChain 基础外观，统一记录与限流。

    运行时协作者与调用上下文以私有属性持有，因此不会进入 `asdict()` 或调用参数。
    """

    _wrapped: Any = PrivateAttr()
    _settings: LlmSettings = PrivateAttr()
    _llm_messages: LlmMessages = PrivateAttr()
    _default_context: TaskRuntimeContext = PrivateAttr()
    _runtime: LlmRuntime = PrivateAttr()
    _recorder: RunRecorder = PrivateAttr()

    def __init__(
        self,
        *,
        wrapped: Any,
        settings: LlmSettings,
        llm_messages: LlmMessages,
        default_context: TaskRuntimeContext,
        runtime: LlmRuntime,
        recorder: RunRecorder | None = None,
    ) -> None:
        super().__init__()
        self._wrapped = wrapped
        self._settings = settings
        self._llm_messages = llm_messages
        self._default_context = default_context
        self._runtime = runtime
        self._recorder = recorder or RunRecorder()

    @property
    def _llm_type(self) -> str:
        """LangChain 模型类型标识；全项目只在此处定义一次。"""
        return "TeacherAgent"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "LlmModel":
        """把工具绑定下沉到被包装的 provider 模型。"""
        return LlmModel(
            wrapped=self._wrapped.bind_tools(tools, **kwargs),
            settings=self._settings,
            llm_messages=self._llm_messages,
            default_context=self._default_context,
            runtime=self._runtime,
            recorder=self._recorder,
        )

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        response = self._invoke(messages)
        return ChatResult(generations=[ChatGeneration(message=_as_message(response))])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        pending = self._runtime.new_request(self._default_context, self._llm_messages)
        limiter = self._runtime.limiter_for(self._settings)
        with limiter.acquire(), self._recording(pending) as handle:
            for chunk in self._wrapped.stream(messages):
                handle.output_message = _message_dict(chunk)
                handle.usage = extract_usage(chunk)
                yield ChatGenerationChunk(message=_as_chunk(chunk))

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        pending = self._runtime.new_request(self._default_context, self._llm_messages)
        response = await self._retried_async(lambda: self._aattempt(pending, messages)).ainvoke(None)
        return ChatResult(generations=[ChatGeneration(message=_as_message(response))])

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        pending = self._runtime.new_request(self._default_context, self._llm_messages)
        limiter = self._runtime.limiter_for(self._settings)
        async with limiter.aacquire():
            with self._recording(pending) as handle:
                async for chunk in self._wrapped.astream(messages):
                    handle.output_message = _message_dict(chunk)
                    handle.usage = extract_usage(chunk)
                    yield ChatGenerationChunk(message=_as_chunk(chunk))

    def _invoke(self, messages: list[BaseMessage]) -> Any:
        """一次同步调用：按固定次数重试，每次尝试单独占用许可并落库。"""
        pending = self._runtime.new_request(self._default_context, self._llm_messages)
        return self._retried(lambda: self._attempt(pending, messages)).invoke(None)

    def _attempt(self, pending: PendingRequest, messages: list[BaseMessage]) -> Any:
        """一次同步 provider 尝试：限流许可内写入本次尝试的记录与结果。"""
        limiter = self._runtime.limiter_for(self._settings)
        with limiter.acquire(), self._recording(pending) as handle:
            response = self._wrapped.invoke(messages)
            handle.output_message = _message_dict(response)
            handle.usage = extract_usage(response)
            return response

    async def _aattempt(self, pending: PendingRequest, messages: list[BaseMessage]) -> Any:
        """一次异步 provider 尝试；等待许可时不阻塞事件循环。"""
        limiter = self._runtime.limiter_for(self._settings)
        async with limiter.aacquire():
            with self._recording(pending) as handle:
                response = await self._wrapped.ainvoke(messages)
                handle.output_message = _message_dict(response)
                handle.usage = extract_usage(response)
                return response

    def _retried(self, attempt: Callable[[], Any]) -> Runnable[None, Any]:
        """把一次尝试包装为按固定次数重试的 `Runnable`。"""

        def _run(_: None) -> Any:
            return attempt()

        return RunnableLambda(_run).with_retry(
            retry_if_exception_type=RETRY_EXCEPTION_TYPES,
            stop_after_attempt=RETRY_ATTEMPTS,
            exponential_jitter_params={
                "initial": RETRY_WAIT_INITIAL,
                "max": RETRY_WAIT_MAX,
                "exp_base": 2,
                "jitter": RETRY_WAIT_JITTER,
            },
        )

    def _retried_async(self, attempt: Callable[[], Awaitable[Any]]) -> Runnable[None, Any]:
        """异步版本的包装；重试等待在异步路径上完成。"""

        async def _run(_: None) -> Any:
            return await attempt()

        return RunnableLambda(_run).with_retry(
            retry_if_exception_type=RETRY_EXCEPTION_TYPES,
            stop_after_attempt=RETRY_ATTEMPTS,
            exponential_jitter_params={
                "initial": RETRY_WAIT_INITIAL,
                "max": RETRY_WAIT_MAX,
                "exp_base": 2,
                "jitter": RETRY_WAIT_JITTER,
            },
        )

    @contextmanager
    def _recording(self, pending: PendingRequest) -> Generator[RunHandle]:
        """记录一次尝试；`sequence` 已固定，`attempt` 与 `run_id` 在此逐次分配。"""
        with self._recorder.record(
            pending.next_attempt(),
            role=self._settings["role"],
            provider=self._settings["provider"],
            model=self._settings["model"],
            temperature=self._settings["temperature"],
        ) as handle:
            yield handle


def _as_message(response: Any) -> AIMessage:
    """把 provider 返回值归一为 `AIMessage`，并保留用量元数据。"""
    if isinstance(response, AIMessage):
        return response
    return AIMessage(
        content=getattr(response, "content", str(response)),
        usage_metadata=getattr(response, "usage_metadata", None),
    )


def _as_chunk(chunk: Any) -> AIMessageChunk:
    if isinstance(chunk, AIMessageChunk):
        return chunk
    return AIMessageChunk(content=getattr(chunk, "content", str(chunk)))


def _message_dict(response: Any) -> dict[str, Any]:
    if hasattr(response, "model_dump"):
        value = response.model_dump()
        if isinstance(value, dict):
            return cast(dict[str, Any], value)
        return {"content": str(response)}
    return {"content": getattr(response, "content", str(response))}