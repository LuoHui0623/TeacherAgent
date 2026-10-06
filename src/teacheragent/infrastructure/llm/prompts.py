"""统一 Agent 提示词资产加载与模板渲染。"""

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from importlib import resources
from types import MappingProxyType
from typing import Any, Final

_PACKAGE = "teacheragent"
_PROMPT_PREFIX = "agent/prompts/"

PROMPT_REGISTRY: Final[Mapping[str, str]] = MappingProxyType({
    "outline": "agent/prompts/outline-architect.md",
})
"""能力键到提示词模板的静态注册表。"""

_PLACEHOLDER: Final[re.Pattern[str]] = re.compile(r"\$\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
"""模板注入占位符：`${{ 名称 }}`，名称对应注入上下文的一个键。"""


class PromptRenderError(ValueError):
    """模板声明的注入项在上下文中缺失。"""


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


def render_template(template: str, context: Mapping[str, Any]) -> str:
    """把模板中的 `${{ 名称 }}` 替换为注入值。

    字符串值原样注入，其它值按带缩进的 JSON 注入。替换是一次性的：注入值里
    出现的 `${{ 名称 }}` 不会再被展开。上下文缺少模板声明的名称时抛
    `PromptRenderError`，不留下未替换的占位符。
    """
    missing: list[str] = []

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in context:
            missing.append(name)
            return match.group(0)
        value = context[name]
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, indent=2)

    rendered = _PLACEHOLDER.sub(replace, template)
    if missing:
        named = "、".join(sorted(set(missing)))
        raise PromptRenderError(f"提示词模板声明的注入项缺失：{named}")
    return rendered


def build_messages(
    *,
    capability: str,
    context: Mapping[str, Any],
    role: str,
) -> list[dict[str, str]]:
    """按能力键加载模板，在占位符处注入上下文，返回指定 role 的一条消息。"""
    prompt = load_prompt(PROMPT_REGISTRY[capability])
    return [{"role": role, "content": render_template(prompt.content, context)}]


def build_sys_messages(*, capability: str, context: Mapping[str, Any]) -> list[dict[str, str]]:
    """以固定 `system` 角色组装模板消息 —— 提示词模板的本职形态。"""
    return build_messages(capability=capability, context=context, role="system")
