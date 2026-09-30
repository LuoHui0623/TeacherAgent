"""统一 Agent 提示词资产加载。"""

import hashlib
from dataclasses import dataclass
from importlib import resources

_PACKAGE = "teacheragent"
_PROMPT_PREFIX = "agent/prompts/"


@dataclass(frozen=True)
class Prompt:
    """一次提示词加载结果。"""

    ref: str
    content: str
    content_hash: str


def _content_hash(content: str) -> str:
    """计算提示词正文的稳定 SHA-256 哈希。"""
    return "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()


def load_prompt(ref: str) -> Prompt:
    """按 `agent/prompts/*.md` 包内路径加载提示词资产。"""
    normalized = ref.strip().lstrip("/")
    if not normalized.startswith(_PROMPT_PREFIX) or not normalized.endswith(".md"):
        raise ValueError(f"提示词路径必须形如 agent/prompts/<名称>.md：{ref}")
    relative_parts = normalized.split("/")
    if len(relative_parts) != 3 or not relative_parts[-1][:-3]:
        raise ValueError(f"提示词路径必须形如 agent/prompts/<名称>.md：{ref}")

    target = resources.files(_PACKAGE)
    for part in relative_parts:
        target = target.joinpath(part)
    content = target.read_text(encoding="utf-8")
    return Prompt(ref=normalized, content=content, content_hash=_content_hash(content))
