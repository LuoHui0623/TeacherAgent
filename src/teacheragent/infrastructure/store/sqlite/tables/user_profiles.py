"""user_profiles 表契约。"""

from typing import TypedDict


class UserProfileRow(TypedDict):
    """`user_profiles` 行：画像 Markdown 的一个版本快照。

    版本 id 形如 `admin-20260914123000`（`user_key` 前缀 + 秒级时间戳）；
    当前版本 = 同一 `user_key` 下 `created_at` 最大的那行。
    """

    id: str
    user_key: str
    content: str
    content_hash: str
    created_at: str


TABLE = "user_profiles"
"""表名。"""

ROW = UserProfileRow
"""行契约。"""