"""`user_interaction` 表契约（原 `behavior_logs`，仅改名）。"""

from typing import TypedDict


class UserInteractionRow(TypedDict):
    """一条用户行为记录。

    本轮只把 `behavior_logs` 改名为 `user_interaction`，列与索引结构不变；
    职责与写入点尚未定义，定义前不允许任何代码写入本表。
    """

    id: int
    user_key: str
    action: str
    detail: str
    created_at: str


TABLE = "user_interaction"
"""表名。"""

ROW = UserInteractionRow
"""行契约。"""
