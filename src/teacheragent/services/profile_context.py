"""画像进入教材运行上下文的装配。

开始编写教材时读取当前 Markdown 版本，整篇解析后绑定来源版本与内容哈希。
解析失败直接抛错，不静默降级。
"""

from dataclasses import dataclass

from teacheragent.capabilities.profile.contracts import (
    ProfileParseError,
    StructuredProfile,
)
from teacheragent.capabilities.profile.parse import parse_profile_markdown
from teacheragent.infrastructure.store.sqlite.repositories import user_profiles as repo


@dataclass(frozen=True)
class OutlineProfileContext:
    """大纲运行所需的结构化画像与来源锚点。"""

    profile: StructuredProfile
    markdown_version_id: str
    content_hash: str


def load_outline_profile_context(
    user_key: str = repo.DEFAULT_USER_KEY,
) -> OutlineProfileContext:
    """读取当前画像并解析，供大纲生成消费。"""
    row = repo.current(user_key)
    if row is None:
        raise ProfileParseError(
            "当前没有用户画像，无法开始编写教材；请先在 Settings → 用户画像中填写并保存。"
        )

    profile = parse_profile_markdown(
        row["content"],
        markdown_version_id=row["id"],
        content_hash=row["content_hash"],
    )
    return OutlineProfileContext(
        profile=profile,
        markdown_version_id=row["id"],
        content_hash=row["content_hash"],
    )
