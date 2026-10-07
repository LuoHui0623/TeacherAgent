"""llm_profiles 表契约。"""

from typing import TypedDict


class LlmProfileRow(TypedDict):
    """`llm_profiles` 行。"""

    # 归属：哪个角色的哪个 profile
    id: int
    role: str
    profile_id: str

    # 实际配置
    model: str
    temperature: float

    # 状态
    active: int
    valid: int
    updated_at: str


TABLE = "llm_profiles"
"""表名。"""

ROW = LlmProfileRow
"""行契约。"""
