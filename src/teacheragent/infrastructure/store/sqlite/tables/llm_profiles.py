"""llm_profiles 表契约。"""

from typing import TypedDict


class LlmProfileRow(TypedDict):
    """`llm_profiles` 行。"""

    id: int
    role: str
    profile_id: str
    model: str
    temperature: float
    active: int
    valid: int
    updated_at: str


TABLE = "llm_profiles"
"""表名。"""

ROW = LlmProfileRow
"""行契约。"""
