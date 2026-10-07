"""`workflow_snapshots` 仓储：图定义正文快照的追加与读取。"""

import json
from datetime import datetime
from typing import Any

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import workflow_snapshots as table
from teacheragent.infrastructure.store.sqlite.tables.workflow_snapshots import WorkflowSnapshotRow
from teacheragent.shared.time_helper import to_iso


def save_snapshot(
    *,
    workflow_id: str,
    content_hash: str,
    snapshot: dict[str, Any],
    at: datetime | None = None,
) -> WorkflowSnapshotRow:
    """追加一份图快照并返回该行；同 `(workflow_id, content_hash)` 已存在时不改写。

    `snapshot` 是 `WorkflowSnapshot.to_payload()` 的正文；内容寻址让重复冻结
    同一版图定义不产生新行，因此创建 run 时可以无条件调用。
    """
    with connection() as conn:
        conn.execute(
            f"INSERT OR IGNORE INTO {table.TABLE} "
            "(workflow_id, content_hash, snapshot_json, add_time) VALUES (?, ?, ?, ?)",
            (workflow_id, content_hash, json.dumps(snapshot, ensure_ascii=False), to_iso(at)),
        )
    row = get_snapshot(workflow_id=workflow_id, content_hash=content_hash)
    assert row is not None, "刚写入的图快照必须可读"
    return row


def get_snapshot(*, workflow_id: str, content_hash: str) -> WorkflowSnapshotRow | None:
    """按内容身份取图快照行；不存在时返回 None。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE workflow_id = ? AND content_hash = ?",
        (workflow_id, content_hash),
    )
    return rows[0] if rows else None


def list_snapshots(*, workflow_id: str) -> list[WorkflowSnapshotRow]:
    """按追加时间升序列出该 workflow 的全部图快照版本。"""
    return _query(
        f"SELECT * FROM {table.TABLE} WHERE workflow_id = ? ORDER BY add_time, content_hash",
        (workflow_id,),
    )


def _query(sql: str, params: tuple) -> list[WorkflowSnapshotRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
