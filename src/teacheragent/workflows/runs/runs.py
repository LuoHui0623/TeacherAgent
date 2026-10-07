"""运行读模型：pipeline 历史与节点执行摘要。

库不存 run 状态：run 与其节点都由 `node_runs` 按实例归约后归并得到，图结构取自
该 run 冻结的图快照，产物正文取自 `node_artifacts`。读侧只投影，不改写任何行。
"""

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from teacheragent.infrastructure.store.sqlite.repositories import (
    llm_runs as call_repo,
    node_artifacts as artifact_repo,
    node_runs as run_repo,
)
from teacheragent.shared.time_helper import parse_iso
from teacheragent.workflows.contracts import WorkflowDefinition
from teacheragent.workflows.errors import WorkflowNotFoundError
from teacheragent.workflows.execution import store
from teacheragent.workflows.execution.contracts import incoming_edges
from teacheragent.workflows.execution.status import NodeRunStatus, aggregate_status
from teacheragent.workflows.execution.store import latest_rows
from teacheragent.workflows.runs.contracts import (
    ArtifactRef,
    NodeRunSummary,
    WorkflowGraphPayload,
    WorkflowRunDetail,
    WorkflowRunNodeList,
    WorkflowRunSummary,
)


@dataclass(frozen=True)
class RunContext:
    """一次运行的读数上下文：图、执行行与产物行。"""

    workflow_id: str
    run_id: str
    graph_hash: str
    definition: WorkflowDefinition
    rows: tuple[Mapping[str, Any], ...]
    artifacts: tuple[Mapping[str, Any], ...]

    @property
    def instance_rows(self) -> tuple[Mapping[str, Any], ...]:
        """按实例归约到当前代次的执行行；重跑的旧代次不参与投影。"""
        return tuple(latest_rows(self.rows, key=("node_id", "item_key")))

    def node_rows(self, node_id: str) -> tuple[Mapping[str, Any], ...]:
        """某个节点的当前代次执行行，按条目分行。"""
        return tuple(row for row in self.instance_rows if row["node_id"] == node_id)


def load_run_context(*, workflow_id: str, run_id: str) -> RunContext:
    """装载一次运行的行与图；该流程下没有这次运行时抛 `WorkflowNotFoundError`。"""
    rows = run_repo.list_runs(workflow_id=workflow_id, run_id=run_id)
    if not rows:
        raise WorkflowNotFoundError(f"{workflow_id} 没有这次运行：{run_id}")
    graph_hash = str(rows[0]["workflow_content_hash"])
    return RunContext(
        workflow_id=workflow_id,
        run_id=run_id,
        graph_hash=graph_hash,
        definition=store.load_definition(workflow_id=workflow_id, graph_hash=graph_hash),
        rows=tuple(rows),
        artifacts=tuple(artifact_repo.list_artifacts(workflow_id=workflow_id, run_id=run_id)),
    )


def list_workflow_runs(*, workflow_id: str, limit: int = 50) -> list[WorkflowRunSummary]:
    """按最近活动排序列出该流程的 pipeline 历史。"""
    return [
        {
            "runId": group["run_id"],
            "workflowId": group["workflow_id"],
            "status": str(aggregate_status(NodeRunStatus(status) for status in group["statuses"])),
            "startedAt": group["started_at"],
            "updatedAt": group["updated_at"],
            "durationMs": _duration_ms(group["started_at"], group["updated_at"]),
            "nodeCount": group["node_count"],
            "graphContentHash": group["workflow_content_hash"],
            "triggerMessageId": group["trigger_message_id"],
        }
        for group in run_repo.list_run_groups(workflow_id=workflow_id, limit=limit)
    ]


def load_workflow_run(*, workflow_id: str, run_id: str) -> WorkflowRunDetail:
    """取一次运行的详情：摘要、冻结的图与节点摘要。"""
    context = load_run_context(workflow_id=workflow_id, run_id=run_id)
    summary = _summary(context)
    return {
        **summary,
        "graph": _graph_payload(context),
        "nodes": node_summaries(context),
    }


def load_workflow_run_nodes(*, workflow_id: str, run_id: str) -> WorkflowRunNodeList:
    """取一次运行的节点摘要列表。"""
    context = load_run_context(workflow_id=workflow_id, run_id=run_id)
    return {"runId": context.run_id, "nodes": node_summaries(context)}


def node_summaries(context: RunContext) -> list[NodeRunSummary]:
    """图里每个节点的执行摘要；尚未来过的节点报 `pending`，带空产物。"""
    calls = calls_by_node(context)
    inputs = incoming_artifacts(context)
    outputs = outgoing_artifacts(context)
    summaries: list[NodeRunSummary] = []
    for node in context.definition.nodes:
        rows = context.node_rows(node.id)
        summaries.append(
            {
                "nodeId": node.id,
                "kind": str(node.kind),
                "label": node.label,
                "status": str(node_status(rows)),
                "attempts": max((int(row["attempt"]) for row in rows), default=0),
                "itemKeys": sorted({str(row["item_key"]) for row in rows}),
                "callCount": len(calls.get(node.id, ())),
                "eventTime": max((str(row["event_time"]) for row in rows), default=""),
                "error": _node_error(rows),
                "inputs": inputs.get(node.id, []),
                "outputs": outputs.get(node.id, []),
            }
        )
    return summaries


def _summary(context: RunContext) -> WorkflowRunSummary:
    """运行级汇总：状态与起止都从这一组行派生。"""
    rows = context.rows
    started = min(str(row["event_time"]) for row in rows)
    updated = max(str(row["event_time"]) for row in rows)
    return {
        "runId": context.run_id,
        "workflowId": context.workflow_id,
        "status": str(aggregate_status(NodeRunStatus(row["status"]) for row in context.instance_rows)),
        "startedAt": started,
        "updatedAt": updated,
        "durationMs": _duration_ms(started, updated),
        "nodeCount": len(context.instance_rows),
        "graphContentHash": context.graph_hash,
        "triggerMessageId": next(
            (row["trigger_message_id"] for row in rows if row["trigger_message_id"]),
            None,
        ),
    }


def _graph_payload(context: RunContext) -> WorkflowGraphPayload:
    """该 run 冻结的图：前端按它渲染，不受定义后续变更影响。"""
    return {
        **context.definition.to_payload(),
        "version": context.definition.version,
        "contentHash": context.graph_hash,
    }


def calls_by_node(context: RunContext) -> dict[str, list[Mapping[str, Any]]]:
    """按节点归组这次运行的模型调用；非 workflow 调用（`node_id` 为空）不属于任何节点。"""
    grouped: dict[str, list[Mapping[str, Any]]] = {}
    for row in call_repo.list_node_calls(workflow_id=context.workflow_id, run_id=context.run_id):
        node_id = row["node_id"]
        if node_id:
            grouped.setdefault(str(node_id), []).append(row)
    return grouped


def outgoing_artifacts(context: RunContext) -> dict[str, list[ArtifactRef]]:
    """每个节点的产出，按端口条目归约到当前代次。"""
    ports = _port_types(context.definition)
    grouped: dict[str, list[ArtifactRef]] = {}
    for row in latest_rows(context.artifacts, key=("node_id", "port_id", "item_key")):
        grouped.setdefault(str(row["node_id"]), []).append(_artifact_ref(ports, row))
    return grouped


def incoming_artifacts(context: RunContext) -> dict[str, list[ArtifactRef]]:
    """每个节点的输入：连到它的上游端口上现有的产物版本。"""
    produced = outgoing_artifacts(context)
    edges = incoming_edges(context.definition)
    incoming: dict[str, list[ArtifactRef]] = {}
    for node in context.definition.nodes:
        items: list[ArtifactRef] = []
        for port in node.inputs:
            for edge in edges.get((node.id, port.id), ()):
                items.extend(
                    item
                    for item in produced.get(edge.source.node_id, ())
                    if item["portId"] == edge.source.port_id
                )
        if items:
            incoming[node.id] = items
    return incoming


def _port_types(definition: WorkflowDefinition) -> dict[tuple[str, str], str]:
    """节点端口到产物类型的索引；产物行只存正文，类型由端口定义给出。"""
    return {
        (node.id, port.id): port.artifact_type
        for node in definition.nodes
        for port in (*node.inputs, *node.outputs)
    }


def _artifact_ref(ports: Mapping[tuple[str, str], str], row: Mapping[str, Any]) -> ArtifactRef:
    """产物行投影成引用加正文。"""
    node_id, port_id = str(row["node_id"]), str(row["port_id"])
    return {
        "nodeId": node_id,
        "portId": port_id,
        "itemKey": str(row["item_key"]),
        "generation": int(row["generation"]),
        "type": ports.get((node_id, port_id), ""),
        "contentHash": str(row["content_hash"]),
        "payload": json.loads(row["payload_json"]),
    }


def node_status(rows: Iterable[Mapping[str, Any]]) -> NodeRunStatus:
    """节点状态由它的条目行归并；没有行说明还没轮到它。"""
    return aggregate_status(NodeRunStatus(row["status"]) for row in rows)


def _node_error(rows: Iterable[Mapping[str, Any]]) -> str:
    """节点上出现过的第一条错误；没有错误时是空串。"""
    return next((str(row["error"]) for row in rows if row["error"]), "")


def _duration_ms(started_at: str, updated_at: str) -> int:
    """两个事件时间之间的毫秒数。"""
    return int((parse_iso(updated_at) - parse_iso(started_at)).total_seconds() * 1000)
