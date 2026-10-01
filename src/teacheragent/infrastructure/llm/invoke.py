"""LLM 原子能力：读配置、建客户端后经统一模型外观调用。"""

from typing import Any

from teacheragent.capabilities.llm.contracts import LlmMessages
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.llm.model import LlmModel
from teacheragent.infrastructure.llm.runtime import TaskRuntimeContext, get_llm_runtime
from teacheragent.infrastructure.llm.settings import get_settings


def invoke_llm(
    role: AgentRole | str,
    messages: list[dict[str, str]],
    *,
    task_context: TaskRuntimeContext | None = None,
) -> Any:
    """经统一模型外观执行一次同步 LLM 调用。"""
    settings = get_settings(role)
    runtime = get_llm_runtime()
    task_context = task_context or TaskRuntimeContext(role=str(role))
    model = LlmModel(
        wrapped=runtime.get_model(settings, llm_client.build_client),
        settings=settings,
        llm_messages=LlmMessages(messages=messages, sources=[], template_text=""),
        default_context=task_context,
        runtime=runtime,
    )
    return model.invoke(messages)
