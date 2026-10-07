"""大纲业务上下文解析与提示词消息入口。"""

from collections.abc import Mapping
from typing import Any

from teacheragent.capabilities.llm.contracts import LlmMessages
from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.infrastructure.llm.prompts import load_prompt, render_prompt


def build_outline_messages(
    brief: Mapping[str, Any],
    profile: StructuredProfile,
    *,
    prompt_ref: str,
) -> LlmMessages:
    """按绑定表注入大纲业务输入，返回可记录的提示词消息。

    资产路径由图定义里节点的 `promptRef` 给出，调用方传入 —— 渲染用的模板与记录
    下来的身份因此始终是同一份资产。
    """
    return render_prompt(
        load_prompt(prompt_ref),
        {
            "brief": dict(brief),
            "learnerProfile": profile.model_dump(mode="json"),
        },
    )
