"""LLM 提示词加载与版本管理。"""

from dataclasses import dataclass
from importlib import resources

from teacheragent.constants import AgentRole


@dataclass(frozen=True)
class Prompt:
    """一次提示词加载结果。"""

    ref: str
    content: str
    version: str | None = None


def load_prompt(role: AgentRole | str, version: str | None = None) -> Prompt:
    """加载角色提示词；未指定版本时返回当前版本。"""
    key = str(role)
    name = f"{key}.md" if version is None else f"{key}@{version}.md"
    content = resources.files("teacheragent.prompts").joinpath(name).read_text(encoding="utf-8")
    return Prompt(ref=f"prompts/{name}", content=content, version=version)
