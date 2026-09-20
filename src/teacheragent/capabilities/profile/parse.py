"""画像 Markdown 解析能力。

解析时机固定为「开始编写教材时」。解析结果只包含画像内容；Markdown 版本和
内容哈希作为运行元数据传入调用日志，但不进入结构化画像。
"""

import json
from typing import Any

from pydantic import ValidationError

from teacheragent.capabilities.profile.contracts import (
    ProfileParseError,
    StructuredProfile,
)
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm.client import describe_error
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm.prompts import load_prompt

PARSE_PROMPT_REF = "agent/prompts/profile-parse.md"
"""画像解析提示词资产路径。"""


def parse_profile_markdown(
    markdown: str,
    *,
    markdown_version_id: str,
    content_hash: str,
) -> StructuredProfile:
    """整篇解析画像 Markdown，并返回经 Pydantic 校验的结构化画像。

    版本 ID 与内容哈希只用于运行溯源，会进入模型输入与调用日志，不进入结果契约。
    失败时抛出 `ProfileParseError`，调用方必须中断教材流程。
    """
    prompt = load_prompt(PARSE_PROMPT_REF)
    messages = [
        {"role": "system", "content": prompt.content},
        {
            "role": "user",
            "content": _build_user_content(
                markdown,
                markdown_version_id=markdown_version_id,
                content_hash=content_hash,
            ),
        },
    ]

    try:
        response = invoke_llm(AgentRole.CURRICULUM, messages)
    except ProfileParseError:
        raise
    except Exception as exc:
        detail = describe_error(exc)["message"]
        raise ProfileParseError(f"画像解析调用失败：{detail}") from exc

    content = getattr(response, "content", None)
    if not isinstance(content, str):
        raise ProfileParseError("画像解析调用没有返回文本结果")

    return parse_profile_response(content)


def parse_profile_response(content: str) -> StructuredProfile:
    """解析并校验模型返回的 JSON；便于单测与后续流式调用复用。"""
    text = _strip_code_fence(content)
    try:
        return StructuredProfile.model_validate_json(text)
    except ValidationError as exc:
        raise ProfileParseError(_format_validation_error(exc)) from exc


def _build_user_content(
    markdown: str,
    *,
    markdown_version_id: str,
    content_hash: str,
) -> str:
    trace = {
        "markdownVersionId": markdown_version_id,
        "contentHash": content_hash,
    }
    return (
        "请按 system 中的契约解析下面这份画像 Markdown。\n\n"
        "运行溯源元数据（只用于调用日志，不要进入输出 JSON）：\n"
        f"{json.dumps(trace, ensure_ascii=False, indent=2)}\n\n"
        "画像 Markdown：\n"
        "```markdown\n"
        f"{markdown}\n"
        "```"
    )


def _strip_code_fence(content: str) -> str:
    text = content.strip()
    if text.startswith("```") and text.endswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            return "\n".join(lines[1:-1]).strip()
    return text


def _format_validation_error(exc: ValidationError) -> str:
    error = exc.errors()[0]
    error_type = error["type"]
    location = ".".join(str(part) for part in error["loc"])

    if error_type == "json_invalid":
        return "画像解析结果不是合法 JSON"
    if error_type == "missing":
        return f"画像解析结果缺少字段：{location}"
    if error_type == "extra_forbidden":
        return f"画像解析结果包含未知字段：{location}"
    return f"画像解析结果不符合契约：{location}：{error['msg']}"
