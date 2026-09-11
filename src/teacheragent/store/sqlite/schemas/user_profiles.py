"""user_profiles 表：用户画像（不量化打分，明确总结技术栈与水平）。"""

TABLE = "user_profiles"

COLUMNS = ("id", "user_key", "summary", "updated_at")


class UserProfileRow:
    """user_profiles 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.user_key: str = row["user_key"]
        self.summary: str = row["summary"]
        self.updated_at: str = row["updated_at"]
