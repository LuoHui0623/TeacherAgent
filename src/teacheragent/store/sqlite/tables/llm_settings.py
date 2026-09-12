"""llm_settings 表契约。"""

from typing import TypedDict


class LlmSettingsRow(TypedDict):
    """`llm_settings` 行（表存储形态，含主键与时间戳）。"""

    id: int
    role: str
    provider: str
    model: str
    temperature: float
    updated_at: str


TABLE = "llm_settings"
"""表名。"""

ROW = LlmSettingsRow
"""行契约，供 `tests/test_table_contracts.py` 与 DDL 交叉校验。"""
