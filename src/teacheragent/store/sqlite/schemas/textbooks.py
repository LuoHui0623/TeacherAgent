"""textbooks 表：教材资产。"""

TABLE = "textbooks"

COLUMNS = ("id", "title", "status", "content", "call_log_id", "created_at", "updated_at")


class TextbookRow:
    """textbooks 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.title: str = row["title"]
        self.status: str = row["status"]
        self.content: str = row["content"]
        self.call_log_id: int | None = row["call_log_id"]
        self.created_at: str = row["created_at"]
        self.updated_at: str = row["updated_at"]
