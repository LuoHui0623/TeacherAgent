"""`chat_messages` 表契约。"""

from typing import TypedDict


class ChatMessageRow(TypedDict):
    """一条对话消息。

    `type` 区分消息类别，`proposal`（发起一次教材生产的提议）是其中一种；
    `role` 是对话方（`user` / `assistant`）。run 只能由这里的某条消息发起，
    因此创建 run 时要把该消息的 `message_id` 记进 `node_runs.trigger_message_id`。
    `event_time` 是这条消息发生的时刻，与 `node_runs` / `node_artifacts` 同一口径。
    """

    message_id: str
    role: str
    type: str
    content: str
    event_time: str


TABLE = "chat_messages"
"""表名。"""

ROW = ChatMessageRow
"""行契约。"""
