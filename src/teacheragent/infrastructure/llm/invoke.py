"""LLM 原子能力：读配置、建客户端后经统一模型外观调用。"""

from typing import Any

from teacheragent.capabilities.llm.contracts import LlmMessages, WorkflowCallOrigin
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.llm.model import LlmModel
from teacheragent.infrastructure.llm.runtime import TaskRuntimeContext, get_llm_runtime
from teacheragent.infrastructure.llm.settings import get_settings


def invoke_llm(
    role: AgentRole | str,
    messages: LlmMessages | list[dict[str, str]],
    *,
    task_context: TaskRuntimeContext | None = None,
    origin: WorkflowCallOrigin | None = None,
) -> Any:
    """经统一模型外观执行一次同步 LLM 调用。

    `messages` 可以是渲染好的提示词消息（带上资产来源与注入绑定），也可以是裸消息
    列表；裸列表没有资产来源，`llm_runs.prompt_sources_json` 记空数组。

    `origin` 说明这次调用属于图上的哪个节点实例；非 workflow 调用不传，
    `llm_runs` 的节点身份列写 NULL。
    """
    settings = get_settings(role)
    runtime = get_llm_runtime()
    task_context = task_context or TaskRuntimeContext(role=str(role))
    model = LlmModel(
        wrapped=runtime.get_model(settings, llm_client.build_client),
        settings=settings,
        llm_messages=_as_llm_messages(messages),
        default_context=task_context,
        runtime=runtime,
        origin=origin,
    )
    return model.invoke(messages.messages if isinstance(messages, LlmMessages) else messages)


def _as_llm_messages(messages: LlmMessages | list[dict[str, str]]) -> LlmMessages:
    """裸消息列表包成最小 `LlmMessages`；已渲染的提示词消息原样使用。"""
    if isinstance(messages, LlmMessages):
        return messages
    return LlmMessages(messages=list(messages), sources=[], template_text="")
