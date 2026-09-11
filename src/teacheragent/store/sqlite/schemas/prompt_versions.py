"""prompt_versions 表：角色提示词版本化存储。"""

TABLE = "prompt_versions"

COLUMNS = ("id", "role", "version", "content", "created_at")


class PromptVersionRow:
    """prompt_versions 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.role: str = row["role"]
        self.version: int = row["version"]
        self.content: str = row["content"]
        self.created_at: str = row["created_at"]
