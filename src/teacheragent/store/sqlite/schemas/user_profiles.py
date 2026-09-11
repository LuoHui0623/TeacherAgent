"""user_profiles 表契约：用户画像（不量化打分，明确总结技术栈与水平）。"""

from typing import TypedDict

TABLE = "user_profiles"

COLUMNS = ("id", "user_key", "summary", "updated_at")


class UserProfile(TypedDict):
    """user_profiles 行。"""

    id: int
    user_key: str
    summary: str
    updated_at: str
