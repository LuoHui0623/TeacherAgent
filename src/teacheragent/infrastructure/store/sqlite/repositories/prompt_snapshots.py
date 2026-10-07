"""`prompt_snapshots` 仓储：提示词资产正文快照的追加与读取。

提示词历史不走 git：每次装载提示词时按内容寻址追加一份快照，版本序列与 diff
都从本表读取。`ref` 是资产路径（如 `agent/prompts/outline-architect.md`）。
"""

from datetime import datetime
from typing import Any, cast

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import prompt_snapshots as table
from teacheragent.infrastructure.store.sqlite.tables.prompt_snapshots import PromptSnapshotRow
from teacheragent.shared.time_helper import to_iso


def save_snapshot(
    *,
    ref: str,
    content_hash: str,
    content: str,
    at: datetime | None = None,
) -> PromptSnapshotRow:
    """追加一份提示词快照并返回该行；同 `(ref, content_hash)` 已存在时不改写。"""
    with connection() as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO {table.TABLE} (ref, content_hash, content, add_time) "
            "VALUES (?, ?, ?, ?)",
            (ref, content_hash, content, to_iso(at)),
        )
    row = get_snapshot(ref=ref, content_hash=content_hash)
    assert row is not None, "刚写入的提示词快照必须可读"
    return row


def get_snapshot(*, ref: str, content_hash: str) -> PromptSnapshotRow | None:
    """按内容身份取提示词快照行；不存在时返回 None。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE ref = ? AND content_hash = ?",
        (ref, content_hash),
    )
    return rows[0] if rows else None


def list_snapshots(*, ref: str) -> list[PromptSnapshotRow]:
    """按追加时间升序列出该资产的提示词版本，最早的一版在最前。"""
    return _query(
        f"SELECT * FROM {table.TABLE} WHERE ref = ? ORDER BY add_time, content_hash",
        (ref,),
    )


def _query(sql: str, params: tuple[Any, ...]) -> list[PromptSnapshotRow]:
    with connection() as conn:
        return [cast(PromptSnapshotRow, dict(row)) for row in conn.execute(sql, params)]
