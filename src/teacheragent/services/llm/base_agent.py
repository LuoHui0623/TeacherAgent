"""角色 Agent 的装配入口。"""

import json
from types import SimpleNamespace
from typing import Any

from teacheragent.agent.tutor import build_tutor_agent
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm.runtime import TaskRuntimeContext, get_llm_runtime
from teacheragent.infrastructure.llm.settings import get_settings


class BaseAgent:
    """把 role 装配到 Tutor 工具图或 Curriculum 原子调用。"""

    def __init__(self, role: AgentRole | str) -> None:
        self.role = AgentRole(str(role))

    def invoke(self, messages: list[dict[str, str]], *, task_context: TaskRuntimeContext | None = None) -> Any:
        task_context = task_context or TaskRuntimeContext(role=str(self.role))
        if self.role is AgentRole.TUTOR:
            return self._invoke_tutor(messages, task_context=task_context)
        return invoke_llm(self.role, messages, task_context=task_context)

    def _invoke_tutor(self, messages: list[dict[str, str]], *, task_context: TaskRuntimeContext) -> Any:
        settings = get_settings(self.role)
        runtime = get_llm_runtime()
        model = runtime.get_model(settings, llm_client.build_client)
        graph = build_tutor_agent(model, task_context=task_context)
        result = graph.invoke(
            {"messages": messages},
            config={"metadata": {"task_context": task_context}},
        )
        return SimpleNamespace(content=_last_message_content(result))


def _last_message_content(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    content = getattr(messages[-1], "content", messages[-1])
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)
