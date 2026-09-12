"""角色 Agent 的装配基类。"""

from teacheragent.capabilities.llm.invoke import invoke_llm
from teacheragent.constants import AgentRole


class BaseAgent:
    """将具体 Agent 角色装配到 LLM 能力上。"""

    def __init__(self, role: AgentRole | str) -> None:
        self.role = role

    def invoke(self, messages: list[dict[str, str]], prompt_ref: str | None = None):
        return invoke_llm(self.role, messages, prompt_ref)
