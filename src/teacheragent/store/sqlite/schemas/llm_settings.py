"""llm_settings 表：每角色的模型配置（当前选用模型 + 用户喜好 temperature）。"""

TABLE = "llm_settings"

COLUMNS = ("id", "role", "provider", "model", "temperature", "updated_at")


class LlmSettingsRow:
    """llm_settings 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.role: str = row["role"]
        self.provider: str = row["provider"]
        self.model: str = row["model"]
        self.temperature: float = row["temperature"]
        self.updated_at: str = row["updated_at"]
