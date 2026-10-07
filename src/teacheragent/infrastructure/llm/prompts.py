"""统一 Agent 提示词资产的加载、变量解析与模板渲染。

一次加载得到一份 `Prompt`：正文、内容身份、变量清单，以及模板里声明变量的那一段
（注入载荷）与它之前的静态前缀。`render_prompt` 按这个结构决定渲染成几条消息：
没有变量的是纯静态提示词，整份进一条消息；有变量的是模板，静态前缀与注入载荷各一条。
"""

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from importlib import resources
from typing import Any, Final

from teacheragent.capabilities.llm.contracts import LlmMessages, PromptSource
from teacheragent.infrastructure.store.sqlite.repositories import prompt_snapshots

_PACKAGE: Final[str] = "teacheragent"
_PROMPT_PREFIX: Final[str] = "agent/prompts/"

_PLACEHOLDER: Final[re.Pattern[str]] = re.compile(r"\$\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
"""模板注入占位符：`${{ 名称 }}`，名称对应绑定表的一个键。"""

_PARAGRAPH_BREAK: Final[re.Pattern[str]] = re.compile(r"\n[ \t]*\n")
"""段落分隔：空行。注入载荷从第一个声明变量的段落起算。"""


class PromptRenderError(ValueError):
    """模板声明的变量在绑定表里缺失。"""


class PromptFormatError(ValueError):
    """提示词资产的写法不符合模板约定。"""


@dataclass(frozen=True)
class Prompt:
    """一次提示词资产加载结果。

    模板声明的每个变量都是必需变量，渲染时缺一即报 `PromptRenderError`。
    正文按「第一个声明变量的段落」切分：`static_prefix` 是它之前的正文，跨调用不变；
    `injection` 是从它到文末的载荷，只随绑定表变化。模板没有变量时是纯静态提示词，
    `injection` 为 None，`static_prefix` 就是正文。
    """

    ref: str
    content: str
    content_hash: str
    variables: tuple[str, ...]
    static_prefix: str
    injection: str | None


def normalize_ref(ref: str) -> str:
    """校验并归一化资产路径，返回 `agent/prompts/<名称>.md` 形式。"""
    normalized = ref.strip().lstrip("/")
    if not normalized.startswith(_PROMPT_PREFIX) or not normalized.endswith(".md"):
        raise PromptFormatError(f"提示词路径必须形如 agent/prompts/<名称>.md：{ref}")
    relative_parts = normalized.split("/")
    if len(relative_parts) != 3 or not relative_parts[-1][:-3]:
        raise PromptFormatError(f"提示词路径必须形如 agent/prompts/<名称>.md：{ref}")
    return normalized


def template_variables(template: str) -> tuple[str, ...]:
    """列出模板声明的变量名称，按首次出现顺序去重。"""
    seen: dict[str, None] = {}
    for match in _PLACEHOLDER.finditer(template):
        seen.setdefault(match.group(1), None)
    return tuple(seen)


def read_prompt(ref: str) -> Prompt:
    """读取提示词资产并解析其结构，不写快照。

    资产不存在时抛 `FileNotFoundError`；路径写法不合法或正文结构不合约定时抛
    `PromptFormatError`。
    """
    normalized = normalize_ref(ref)
    target = resources.files(_PACKAGE)
    for part in normalized.split("/"):
        target = target.joinpath(part)
    content = target.read_text(encoding="utf-8")
    static_prefix, injection = split_prompt_text(normalized, content)
    return Prompt(
        ref=normalized,
        content=content,
        content_hash=_content_hash(content),
        variables=template_variables(content),
        static_prefix=static_prefix,
        injection=injection,
    )


def load_prompt(ref: str) -> Prompt:
    """读取提示词资产，并把这一版正文冻结进快照表。

    加载即冻结：`prompt_snapshots` 按 `(ref, content_hash)` 内容寻址，同一版只写一次，
    所以提示词历史完整可回溯，不需要 git 参与。只读场景（读接口）用 `read_prompt`。
    """
    prompt = read_prompt(ref)
    prompt_snapshots.save_snapshot(
        ref=prompt.ref,
        content_hash=prompt.content_hash,
        content=prompt.content,
    )
    return prompt


def render_template(template: str, bindings: Mapping[str, Any]) -> str:
    """把模板中的 `${{ 名称 }}` 替换为绑定表里的值。

    字符串值原样注入，其它值按带缩进的 JSON 注入。替换是一次性的：注入值里
    出现的 `${{ 名称 }}` 不会再被展开。绑定表缺少模板声明的变量时抛
    `PromptRenderError`，不留下未替换的占位符。
    """
    missing: list[str] = []

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        if name not in bindings:
            missing.append(name)
            return match.group(0)
        value = bindings[name]
        if isinstance(value, str):
            return value
        return json.dumps(value, ensure_ascii=False, indent=2)

    rendered = _PLACEHOLDER.sub(replace, template)
    if missing:
        named = "、".join(sorted(set(missing)))
        raise PromptRenderError(f"提示词模板声明的注入项缺失：{named}")
    return rendered


def render_prompt(
    prompt: Prompt,
    bindings: Mapping[str, Any] | None = None,
    *,
    role: str = "system",
    payload_role: str = "user",
) -> LlmMessages:
    """按模板结构渲染成消息，并带上来源身份与本次绑定。

    模板没有声明变量时整份渲染成一条 `role` 消息；声明了变量时静态前缀渲染成
    `role` 消息、注入载荷渲染成 `payload_role` 消息 —— 每次调用变化的输入因此
    独立成一条消息，静态规则保持稳定前缀。
    """
    table = dict(bindings or {})
    if prompt.injection is None:
        text = render_template(prompt.content, table)
        return LlmMessages(
            sources=[
                _source(
                    prompt,
                    role=role,
                    order=0,
                    template_text=prompt.content,
                    rendered_text=text,
                )
            ],
            template_text=prompt.content,
            injected_context=table or None,
            messages=[{"role": role, "content": text}],
        )

    prefix = render_template(prompt.static_prefix, table)
    payload = render_template(prompt.injection, table)
    return LlmMessages(
        sources=[
            _source(
                prompt,
                role=role,
                order=0,
                template_text=prompt.static_prefix,
                rendered_text=prefix,
            ),
            _source(
                prompt,
                role=payload_role,
                order=1,
                template_text=prompt.injection,
                rendered_text=payload,
            ),
        ],
        template_text=prompt.content,
        injected_context=table or None,
        messages=[
            {"role": role, "content": prefix},
            {"role": payload_role, "content": payload},
        ],
    )


def _source(
    prompt: Prompt,
    *,
    role: str,
    order: int,
    template_text: str,
    rendered_text: str,
) -> PromptSource:
    """记下这条消息用了哪份资产的哪一段。"""
    return PromptSource(
        ref=prompt.ref,
        content_hash=prompt.content_hash,
        name=_asset_name(prompt.ref),
        order=order,
        role=role,
        template_text=template_text,
        rendered_text=rendered_text,
    )


def _asset_name(ref: str) -> str:
    """资产路径对应的短名称，如 `agent/prompts/tutor.md` → `tutor`。"""
    return ref.rsplit("/", 1)[-1][: -len(".md")]


def split_prompt_text(ref: str, content: str) -> tuple[str, str | None]:
    """按第一个声明变量的段落切出静态前缀与注入载荷。

    段落之间以空行分隔。没有变量的模板是纯静态提示词，整份都是静态前缀；模板以
    声明变量的段落开头时没有可用的静态前缀，加载期报 `PromptFormatError`，不生成
    空消息。
    """
    start = _payload_start(content)
    if start is None:
        return content.rstrip(), None
    if start == 0:
        raise PromptFormatError(f"模板以声明变量的段落开头，没有静态前缀：{ref}")
    return content[:start].rstrip(), content[start:].strip()


def _payload_start(content: str) -> int | None:
    """第一个声明变量的段落起点；没有变量时返回 None。"""
    position = 0
    for separator in _PARAGRAPH_BREAK.finditer(content):
        if _PLACEHOLDER.search(content, position, separator.start()):
            return position
        position = separator.end()
    return position if _PLACEHOLDER.search(content, position) else None


def _content_hash(content: str) -> str:
    """计算提示词正文的稳定 SHA-256 哈希。"""
    return "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()
