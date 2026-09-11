"""behavior_logs 表契约：学习行为记录（一期只积累不消费）。"""

from typing import TypedDict

TABLE = "behavior_logs"

COLUMNS = ("id", "user_key", "action", "detail", "created_at")


class BehaviorLog(TypedDict):
    """behavior_logs 行。"""

    id: int
    user_key: str
    action: str
    detail: str
    created_at: str
