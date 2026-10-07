"""`node_artifacts` 仓储：产物正文的写入与读取。

产物与执行事实分开存：一条 `node_runs` 行对应同一五列键上的多行产物（按 `port_id` 区分）。
人工门禁的决断不在这里记：门禁自己产出的 `GateReview` 行就是决断记录。
"""

import json
from datetime import datetime
from typing import Any

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import node_artifacts as table
from teacheragent.infrastructure.store.sqlite.tables.node_artifacts import NodeArtifactRow
from teacheragent.shared.time_helper import to_iso

_KEY = "workflow_id = ? AND run_id = ? AND node_id = ? AND item_key = ? AND port_id = ? AND generation = ?"


def save_artifact(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    port_id: str,
    payload: Any,
    content_hash: str,
    item_key: str = "",
    generation: int = 0,
    at: datetime | None = None,
) -> NodeArtifactRow:
    """写入一个产物并返回该行；同一键重写即覆盖正文，`event_time` 推进到本次写入时刻。"""
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} (workflow_id, run_id, node_id, item_key, port_id, "
            "generation, payload_json, content_hash, event_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (workflow_id, run_id, node_id, item_key, port_id, generation) DO UPDATE SET "
            "payload_json = excluded.payload_json, content_hash = excluded.content_hash, "
            "event_time = excluded.event_time",
            (
                workflow_id, run_id, node_id, item_key, port_id, generation,
                json.dumps(payload, ensure_ascii=False), content_hash, to_iso(at),
            ),
        )
    row = get_artifact(
        workflow_id=workflow_id, run_id=run_id, node_id=node_id,
        item_key=item_key, port_id=port_id, generation=generation,
    )
    assert row is not None, "刚写入的产物必须可读"
    return row


def get_artifact(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    port_id: str,
    item_key: str = "",
    generation: int = 0,
) -> NodeArtifactRow | None:
    """按产物键取一行；不存在时返回 None。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE {_KEY}",
        (workflow_id, run_id, node_id, item_key, port_id, generation),
    )
    return rows[0] if rows else None


def list_artifacts(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str | None = None,
    item_key: str | None = None,
    generation: int | None = None,
) -> list[NodeArtifactRow]:
    """按 run / 节点 / 条目 / 代次过滤产物，按追加时间升序返回。"""
    clauses = ["workflow_id = ?", "run_id = ?"]
    params: list = [workflow_id, run_id]
    for column, value in (("node_id", node_id), ("item_key", item_key), ("generation", generation)):
        if value is not None:
            clauses.append(f"{column} = ?")
            params.append(value)
    return _query(
        f"SELECT * FROM {table.TABLE} WHERE {' AND '.join(clauses)} "
        "ORDER BY event_time, node_id, item_key, port_id, generation",
        tuple(params),
    )


def _query(sql: str, params: tuple) -> list[NodeArtifactRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
