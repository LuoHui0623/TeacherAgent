"""执行器与仓储之间的转换：行 ↔ 领域对象，以及一次执行的事务提交。

仓储仍然是唯一写 SQL 的地方，本模块只做形状转换与事务组合：`connection()` 在本线程内
可重入，所以「执行事实 + 它的产物」可以落在同一个事务里。
"""

import json
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime
from typing import Any

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.repositories import (
    node_artifacts as artifact_repo,
    node_runs as run_repo,
    workflow_snapshots as snapshot_repo,
)
from teacheragent.shared.digest import content_hash
from teacheragent.workflows.contracts import Node, WorkflowDefinition, WorkflowSnapshot
from teacheragent.workflows.errors import WorkflowNotFoundError
from teacheragent.workflows.execution.contracts import (
    Artifact,
    ProducedArtifact,
    incoming_edges,
)
from teacheragent.workflows.execution.readiness import ArtifactState, RunState, item_matches
from teacheragent.workflows.execution.status import NodeRunStatus
from teacheragent.workflows.payloads import snapshot_definition

CONTENT_HASH_FIELD = "contentHash"
"""评估正文指向被审内容的字段；装载输入时按它把评估换成内容。"""


def save_snapshot(snapshot: WorkflowSnapshot, *, at: datetime | None = None) -> None:
    """把冻结的图快照写进资产表；内容寻址，重复冻结同一版不会产生新行。"""
    snapshot_repo.save_snapshot(
        workflow_id=snapshot.workflow_id,
        content_hash=snapshot.content_hash,
        snapshot=snapshot.to_payload(),
        at=at,
    )


def run_graph_hash(*, workflow_id: str, run_id: str) -> str:
    """取该 run 冻结的图内容身份；一行都没有说明 run 不存在。"""
    rows = run_repo.list_runs(workflow_id=workflow_id, run_id=run_id, limit=1)
    if not rows:
        raise WorkflowNotFoundError(f"{workflow_id} 没有运行记录：{run_id}")
    return str(rows[0]["workflow_content_hash"])


def load_definition(*, workflow_id: str, graph_hash: str) -> WorkflowDefinition:
    """按图快照正文还原该 run 使用的图定义。"""
    row = snapshot_repo.get_snapshot(workflow_id=workflow_id, content_hash=graph_hash)
    if row is None:
        raise WorkflowNotFoundError(f"{workflow_id} 缺少图快照：{graph_hash}")
    return snapshot_definition(json.loads(row["snapshot_json"]))


def load_run_states(*, workflow_id: str, run_id: str) -> tuple[RunState, ...]:
    """该 run 的执行行，按实例归约到最新代次，再投影成判定要看的状态。"""
    latest = latest_rows(
        run_repo.list_runs(workflow_id=workflow_id, run_id=run_id),
        key=("node_id", "item_key"),
    )
    return tuple(
        RunState(
            node_id=row["node_id"],
            item_key=row["item_key"],
            status=NodeRunStatus(row["status"]),
        )
        for row in latest
    )


def load_artifact_rows(*, workflow_id: str, run_id: str) -> list[Mapping[str, Any]]:
    """该 run 的产物行，按端口条目归约到最新代次；展开条目要看正文，判定只看状态。"""
    return latest_rows(
        artifact_repo.list_artifacts(workflow_id=workflow_id, run_id=run_id),
        key=("node_id", "port_id", "item_key"),
    )


def artifact_states(rows: Iterable[Mapping[str, Any]]) -> tuple[ArtifactState, ...]:
    """产物行投影成就绪判定要看的状态。"""
    return tuple(
        ArtifactState(
            node_id=row["node_id"],
            port_id=row["port_id"],
            item_key=row["item_key"],
            content_hash=row["content_hash"],
        )
        for row in rows
    )


def instance_generation(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    item_key: str = "",
) -> int:
    """某实例的当前代次：该键上出现过的最大 `generation`；没有行时是 0（首次执行）。"""
    rows = run_repo.list_runs(workflow_id=workflow_id, run_id=run_id)
    return max(
        (
            row["generation"]
            for row in rows
            if row["node_id"] == node_id and row["item_key"] == item_key
        ),
        default=0,
    )


def load_inputs(
    definition: WorkflowDefinition,
    node: Node,
    *,
    rows: Sequence[Mapping[str, Any]],
    run_id: str,
    item_key: str,
) -> Mapping[str, tuple[Artifact, ...]]:
    """按输入端口装载该实例这次要消费的产物。

    带 `contentHash` 的评估正文在这里解引用成被审内容：口径是「评估引用内容」，
    所以下游拿到的是内容本身的正文与内容身份，而不是评估行。
    """
    by_hash = {str(row["content_hash"]): row for row in rows}
    edges = incoming_edges(definition)
    bindings: dict[str, tuple[Artifact, ...]] = {}
    for port in node.inputs:
        items: list[Artifact] = []
        for edge in edges.get((node.id, port.id), ()):
            items.extend(
                _artifact(row, by_hash)
                for row in rows
                if row["node_id"] == edge.source.node_id
                and row["port_id"] == edge.source.port_id
                and item_matches(item_key, str(row["item_key"]))
            )
        bindings[port.id] = tuple(items)
    return bindings


def load_payloads(
    definition: WorkflowDefinition,
    node: Node,
    *,
    rows: Sequence[Mapping[str, Any]],
    run_id: str,
    item_key: str,
    port_id: str,
) -> tuple[Any, ...]:
    """装载某个输入端口上全部产物的正文（含评估解引用）。"""
    inputs = load_inputs(definition, node, rows=rows, run_id=run_id, item_key=item_key)
    return tuple(item.payload for item in inputs.get(port_id, ()))


def commit_outcome(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
    item_key: str,
    generation: int,
    graph_hash: str,
    status: NodeRunStatus,
    artifacts: Iterable[ProducedArtifact] = (),
    trigger_message_id: str | None = None,
    attempt: int = 0,
    error: str = "",
    at: datetime | None = None,
) -> None:
    """一个事务里写下一次执行的事实与它产出的产物，不留半写。"""
    with connection():
        run_repo.upsert_run(
            workflow_id=workflow_id,
            run_id=run_id,
            node_id=node_id,
            status=str(status),
            workflow_content_hash=graph_hash,
            trigger_message_id=trigger_message_id,
            item_key=item_key,
            generation=generation,
            attempt=attempt,
            error=error,
            at=at,
        )
        for artifact in artifacts:
            artifact_repo.save_artifact(
                workflow_id=workflow_id,
                run_id=run_id,
                node_id=node_id,
                port_id=artifact.port_id,
                payload=artifact.payload,
                content_hash=content_hash(artifact.payload),
                item_key=item_key,
                generation=generation,
                at=at,
            )


def _artifact(
    row: Mapping[str, Any],
    by_hash: Mapping[str, Mapping[str, Any]],
) -> Artifact:
    """把产物行投影成 `Artifact`；评估正文换成它引用的内容行。"""
    payload = json.loads(row["payload_json"])
    source = _referenced(payload, by_hash)
    target = source if source is not None else row
    return Artifact(
        node_id=str(target["node_id"]),
        port_id=str(target["port_id"]),
        item_key=str(target["item_key"]),
        generation=int(target["generation"]),
        content_hash=str(target["content_hash"]),
        payload=payload if source is None else json.loads(source["payload_json"]),
    )


def _referenced(
    payload: Any,
    by_hash: Mapping[str, Mapping[str, Any]],
) -> Mapping[str, Any] | None:
    """评估正文指向的内容行；不是评估或内容不在本 run 时返回 None。"""
    if not isinstance(payload, Mapping):
        return None
    target = payload.get(CONTENT_HASH_FIELD)
    if not isinstance(target, str):
        return None
    return by_hash.get(target)


def latest_rows(
    rows: Iterable[Mapping[str, Any]],
    *,
    key: tuple[str, ...],
) -> list[Mapping[str, Any]]:
    """每个键只保留 `generation` 最大的那一行。

    重跑的旧代次照旧留在库里可读，但不参与推进；判定与输入装载都只看这一份归约结果。
    """
    latest: dict[tuple, Mapping[str, Any]] = {}
    for row in rows:
        identity = tuple(row[field] for field in key)
        current = latest.get(identity)
        if current is None or row["generation"] > current["generation"]:
            latest[identity] = row
    return list(latest.values())
