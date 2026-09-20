"""大纲生成的消息装配：把结构化画像与 LearningBrief 一起注入。"""

import json
from collections.abc import Mapping
from typing import Any

from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.infrastructure.llm.prompts import load_prompt

ARCHITECT_PROMPT_REF = "agent/prompts/outline-architect.md"
"""大纲能力角色设定路径。"""


def build_outline_messages(
    brief: Mapping[str, Any],
    profile: StructuredProfile,
    *,
    markdown_version_id: str,
    content_hash: str,
) -> list[dict[str, str]]:
    """构造大纲生成输入；画像内容与运行来源分开注入。"""
    prompt = load_prompt(ARCHITECT_PROMPT_REF)
    payload = {
        "brief": dict(brief),
        "learnerProfile": profile.model_dump(mode="json"),
        "profileSource": {
            "markdownVersionId": markdown_version_id,
            "contentHash": content_hash,
        },
    }
    return [
        {"role": "system", "content": prompt.content},
        {
            "role": "user",
            "content": "输入数据：\n" + json.dumps(payload, ensure_ascii=False, indent=2),
        },
    ]
