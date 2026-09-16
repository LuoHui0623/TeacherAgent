"""llm_settings 表契约。"""

from typing import TypedDict


class LlmSettingsRow(TypedDict):
    """`llm_settings` 行（历史配置表，Profile 已替代其运行时用途）。"""

    id: int
    role: str
    provider: str
    model: str
    temperature: float
    updated_at: str


TABLE = "llm_settings"
"""表名。"""

ROW = LlmSettingsRow
"""行契约。"""
