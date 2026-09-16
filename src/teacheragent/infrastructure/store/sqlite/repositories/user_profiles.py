"""user_profiles 仓储：画像 Markdown 的版本化持久化。

版本窗口：当前 1 份 + 历史 2 份。写入新版本后**无条件**滚动删除最旧版本 ——
即使某个历史版本已被某次教材运行引用，也照样删除；溯源能力只保证在窗口内。
"""

import hashlib
import sqlite3
from datetime import UTC, datetime

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import user_profiles as table
from teacheragent.infrastructure.store.sqlite.tables.user_profiles import UserProfileRow

DEFAULT_USER_KEY = "admin"
"""单用户场景的默认用户标识。"""

HISTORY_VERSIONS = 2
"""保留的历史版本份数。"""

MAX_VERSIONS = HISTORY_VERSIONS + 1
"""版本窗口：当前 1 份 + 历史 2 份。"""


def save_version(
    user_key: str,
    content: str,
    *,
    at: datetime | None = None,
) -> UserProfileRow:
    """写入新版本快照，并滚动删除超出窗口的旧版本。"""
    version_id = build_version_id(user_key, at)
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} (id, user_key, content, content_hash) "
            "VALUES (?, ?, ?, ?)",
            (version_id, user_key, content, hash_content(content)),
        )
        _prune(conn, user_key)
    row = get(version_id)
    assert row is not None, "刚写入的版本必须可读"
    return row


def current(user_key: str = DEFAULT_USER_KEY) -> UserProfileRow | None:
    """当前版本：该用户 `created_at` 最大的那一行；无版本时返回 None。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE user_key = ? "
        "ORDER BY created_at DESC, id DESC LIMIT 1",
        (user_key,),
    )
    return rows[0] if rows else None


def get(version_id: str) -> UserProfileRow | None:
    """按版本 id 读取；不存在时返回 None。"""
    rows = _query(f"SELECT * FROM {table.TABLE} WHERE id = ?", (version_id,))
    return rows[0] if rows else None


def list_versions(user_key: str = DEFAULT_USER_KEY) -> list[UserProfileRow]:
    """按时间倒序列出该用户**当前保留**的全部版本。"""
    return _query(
        f"SELECT * FROM {table.TABLE} WHERE user_key = ? "
        "ORDER BY created_at DESC, id DESC",
        (user_key,),
    )


def build_version_id(user_key: str, at: datetime | None = None) -> str:
    """版本 id = `<user_key>-<时间戳>`，时间戳精确到秒（UTC）。"""
    stamp = (at or datetime.now(UTC)).strftime("%Y%m%d%H%M%S")
    return f"{user_key}-{stamp}"


def hash_content(content: str) -> str:
    """内容哈希；写入运行上下文供溯源。"""
    return "sha256:" + hashlib.sha256(content.encode("utf-8")).hexdigest()


def _prune(conn: sqlite3.Connection, user_key: str) -> None:
    """滚动删除超出窗口的版本；被引用的版本同样删除，不做例外。"""
    conn.execute(
        f"DELETE FROM {table.TABLE} WHERE user_key = ? AND id NOT IN ("
        f"  SELECT id FROM {table.TABLE} WHERE user_key = ?"
        "   ORDER BY created_at DESC, id DESC LIMIT ?)",
        (user_key, user_key, MAX_VERSIONS),
    )


def _query(sql: str, params: tuple) -> list[UserProfileRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]