"""behavior_logs 表：学习行为记录（一期只积累不消费）。"""

TABLE = "behavior_logs"

COLUMNS = ("id", "user_key", "action", "detail", "created_at")


class BehaviorLogRow:
    """behavior_logs 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.user_key: str = row["user_key"]
        self.action: str = row["action"]
        self.detail: str = row["detail"]
        self.created_at: str = row["created_at"]
