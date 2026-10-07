"""`chat_messages` 仓储：对话消息的追加与读取。

`llm_runs` 只记每次模型调用的输入输出，对话本身归本表；`proposal`（发起一次教材
生产的提议）是 `type` 的一种取值。
"""

from datetime import datetime

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import chat_messages as table
from teacheragent.infrastructure.store.sqlite.tables.chat_messages import ChatMessageRow
from teacheragent.shared.time_helper import to_iso


def add_message(
    *,
    message_id: str,
    role: str,
    type: str,
    content: str,
    at: datetime | None = None,
) -> ChatMessageRow:
    """追加一条对话消息并返回该行；`message_id` 重复即错，消息只追加不覆盖。"""
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} (message_id, role, type, content, event_time) "
            "VALUES (?, ?, ?, ?, ?)",
            (message_id, role, type, content, to_iso(at)),
        )
    row = get_message(message_id=message_id)
    assert row is not None, "刚写入的对话消息必须可读"
    return row


def get_message(*, message_id: str) -> ChatMessageRow | None:
    """按消息 id 读取；不存在时返回 None。"""
    rows = _query(f"SELECT * FROM {table.TABLE} WHERE message_id = ?", (message_id,))
    return rows[0] if rows else None


def list_messages(*, limit: int = 100) -> list[ChatMessageRow]:
    """取最近 `limit` 条消息，按时间升序返回（最早的一条在最前）。"""
    return _query(
        f"SELECT * FROM (SELECT * FROM {table.TABLE} "
        "ORDER BY event_time DESC, message_id DESC LIMIT ?) ORDER BY event_time, message_id",
        (limit,),
    )


def list_message_ids() -> list[str]:
    """列出全部消息 id，供分配下一条消息的编号。"""
    rows = _query(f"SELECT message_id FROM {table.TABLE}", ())
    return [str(row["message_id"]) for row in rows]


def _query(sql: str, params: tuple) -> list[ChatMessageRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
