"""llm_settings 表契约：每角色的模型配置。"""

from typing import TypedDict

TABLE = "llm_settings"

COLUMNS = ("id", "role", "provider", "model", "temperature", "updated_at")


class LlmSettings(TypedDict):
    """llm_settings 行。"""

    id: int
    role: str
    provider: str
    model: str
    temperature: float
    updated_at: str
