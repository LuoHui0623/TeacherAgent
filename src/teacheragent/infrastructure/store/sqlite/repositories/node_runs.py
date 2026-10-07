"""`node_runs` 仓储：节点执行事实的写入与查询。

没有运行头表：run 是共享 `(workflow_id, run_id)` 的一组行，run 的状态、起止与耗时
由这组行按 `event_time` 派生，因此本模块只提供行级写入与过滤读取。
"""

from collections.abc import Sequence
from datetime import datetime
from typing import TypedDict

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import node_runs as table
from teacheragent.infrastructure.store.sqlite.tables.node_runs import NodeRunRow
from teacheragent.shared.time_helper import to_iso


class RunGroupRow(TypedDict):
    """一个 run 的聚合行：只够列出历史与取图版本，节点明细另查。"""

    workflow_id: str
    run_id: str
    workflow_content_hash: str
    trigger_message_id: str | None
    started_at: str
    updated_at: str
    node_count: int
    statuses: list[str]

_COLUMNS = (
    "workflow_id, run_id, node_id, item_key, generation, workflow_content_hash, "
    "trigger_message_id, status, attempt, event_time, error"
)
"""写入列：与 `@see scripts/007_workflow_runs.sql` 的 DDL 顺序一致。"""

_ORDER = "event_time, workflow_id, run_id, node_id, item_key, generation"
"""读取顺序：先按状态时间，再按主键，保证同一批行每次读出顺序一致。"""


def upsert_run(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    status: str,
    workflow_content_hash: str,
    trigger_message_id: str | None = None,
    item_key: str = "",
    generation: int = 0,
    attempt: int = 0,
    error: str = "",
    at: datetime | None = None,
) -> NodeRunRow:
    """写入或推进一次节点执行并返回该行。

    主键 `(workflow_id, run_id, node_id, item_key, generation)` 就是幂等键：同一节点的
    状态推进（`pending` → `running` → 终态）更新同一行，`event_time` 随之推进到本次写入
    时刻。run 级冗余（图 `content_hash`、触发消息 id）只在首次写入时落值，之后不改写。
    """
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (workflow_id, run_id, node_id, item_key, generation) DO UPDATE SET "
            "status = excluded.status, attempt = excluded.attempt, "
            "event_time = excluded.event_time, error = excluded.error",
            (
                workflow_id, run_id, node_id, item_key, generation, workflow_content_hash,
                trigger_message_id, status, attempt, to_iso(at), error,
            ),
        )
    row = get_run(
        workflow_id=workflow_id, run_id=run_id, node_id=node_id,
        item_key=item_key, generation=generation,
    )
    assert row is not None, "刚写入的节点执行行必须可读"
    return row


def get_run(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    item_key: str = "",
    generation: int = 0,
) -> NodeRunRow | None:
    """按幂等键取一行；不存在时返回 None。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE workflow_id = ? AND run_id = ? AND node_id = ? "
        "AND item_key = ? AND generation = ?",
        (workflow_id, run_id, node_id, item_key, generation),
    )
    return rows[0] if rows else None


def list_runs(
    *,
    workflow_id: str | None = None,
    run_id: str | None = None,
    statuses: Sequence[str] | None = None,
    limit: int = 1000,
) -> list[NodeRunRow]:
    """按流程 / run / 状态过滤节点执行行，按事件时间升序返回。

    启动恢复扫描传 `statuses`（非终态取值）即可一次取回所有待重新调度的行。
    """
    clauses: list[str] = []
    params: list = []
    if workflow_id is not None:
        clauses.append("workflow_id = ?")
        params.append(workflow_id)
    if run_id is not None:
        clauses.append("run_id = ?")
        params.append(run_id)
    if statuses is not None:
        if not statuses:
            return []
        clauses.append(f"status IN ({', '.join('?' * len(statuses))})")
        params.extend(statuses)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    return _query(f"SELECT * FROM {table.TABLE}{where} ORDER BY {_ORDER} LIMIT ?", tuple(params))


def list_run_ids(*, workflow_id: str) -> list[str]:
    """列出该流程已出现过的全部 run id，供分配下一条运行的编号。"""
    with connection() as conn:
        rows = list(
            conn.execute(
                f"SELECT DISTINCT run_id FROM {table.TABLE} WHERE workflow_id = ?",
                (workflow_id,),
            )
        )
    return [str(row["run_id"]) for row in rows]


def list_run_groups(*, workflow_id: str, limit: int = 50) -> list[RunGroupRow]:
    """按 run 聚合某条流程的执行行，最近的 run 在最前。

    聚合出来的都是事实：起止由 `event_time` 的 min / max 得到，`statuses` 是这组行
    出现过的状态集合 —— run 状态由读侧归并，SQL 不做状态语义。
    """
    with connection() as conn:
        rows = list(
            conn.execute(
                "SELECT workflow_id, run_id, MIN(workflow_content_hash) AS workflow_content_hash, "
                "MAX(trigger_message_id) AS trigger_message_id, "
                "MIN(event_time) AS started_at, MAX(event_time) AS updated_at, "
                "COUNT(*) AS node_count, GROUP_CONCAT(DISTINCT status) AS statuses "
                f"FROM {table.TABLE} WHERE workflow_id = ? "
                "GROUP BY workflow_id, run_id ORDER BY MAX(event_time) DESC, run_id DESC LIMIT ?",
                (workflow_id, limit),
            )
        )
    return [
        {
            "workflow_id": str(row["workflow_id"]),
            "run_id": str(row["run_id"]),
            "workflow_content_hash": str(row["workflow_content_hash"]),
            "trigger_message_id": row["trigger_message_id"],
            "started_at": str(row["started_at"]),
            "updated_at": str(row["updated_at"]),
            "node_count": int(row["node_count"]),
            "statuses": str(row["statuses"]).split(","),
        }
        for row in rows
    ]


def _query(sql: str, params: tuple) -> list[NodeRunRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
