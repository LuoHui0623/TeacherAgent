"""大纲业务上下文解析与提示词消息入口。"""

from collections.abc import Mapping
from typing import Any

from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.infrastructure.llm.prompts import build_sys_messages


def build_outline_messages(
    brief: Mapping[str, Any],
    profile: StructuredProfile,
) -> list[dict[str, str]]:
    """解析大纲业务输入并注入 outline 模板上下文。"""
    context = {
        "brief": dict(brief),
        "learnerProfile": profile.model_dump(mode="json"),
    }
    return build_sys_messages(capability="outline", context=context)
