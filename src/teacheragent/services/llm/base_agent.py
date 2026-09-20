"""角色 Agent 的装配入口。"""

import json
from types import SimpleNamespace
from typing import Any

from teacheragent.agent.tutor import build_tutor_agent
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.llm.call_logger import log_llm_call
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm.settings import get_settings


class BaseAgent:
    """把 role 装配到 Tutor 工具图或 Curriculum 原子调用。"""

    def __init__(self, role: AgentRole | str) -> None:
        self.role = AgentRole(str(role))

    def invoke(self, messages: list[dict[str, str]]) -> Any:
        if self.role is AgentRole.TUTOR:
            return self._invoke_tutor(messages)
        return invoke_llm(self.role, messages)

    def _invoke_tutor(self, messages: list[dict[str, str]]) -> Any:
        settings = get_settings(self.role)
        input_text = json.dumps(messages, ensure_ascii=False)
        with log_llm_call(settings, input_text) as record:
            graph = build_tutor_agent(llm_client.build_client(settings))
            result = graph.invoke({"messages": messages})
            output = _last_message_content(result)
            record.output_text = output
            return SimpleNamespace(content=output)


def _last_message_content(result: dict[str, Any]) -> str:
    messages = result.get("messages", [])
    if not messages:
        return ""
    content = getattr(messages[-1], "content", messages[-1])
    if isinstance(content, str):
        return content
    return json.dumps(content, ensure_ascii=False)
