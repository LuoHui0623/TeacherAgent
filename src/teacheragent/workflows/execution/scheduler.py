"""执行器：在内存里维护节点实例的运行时状态，按「就绪判定 + 单节点执行 + 事务提交」推进。

内存里的是状态机（每个实例的当前状态与可跑集合），库是它的持久化：每轮推进先把库里的行
重新整理成运行时状态，再算「哪些能跑」、执行、提交。因此重启后从同一批行重建出的状态一致，
接着跑即可；非终态的行由 `recover()` 重新纳入调度，没有僵尸 TTL 特判。暂停 / 继续是这一
层的内存行为（口径 26），不落库。重跑用 `generation` 追加新代次，旧代次照旧可读。
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final

from teacheragent.infrastructure.store.sqlite.repositories import node_runs as run_repo
from teacheragent.shared.time_helper import to_iso
from teacheragent.workflows.contracts import (
    ITEM_KEY_FIELD,
    ITEMS_PATH_KEY,
    ITEMS_PORT_KEY,
    Node,
    NodeKind,
    WorkflowDefinition,
)
from teacheragent.workflows.errors import NodeExecutionError
from teacheragent.workflows.execution import store
from teacheragent.workflows.execution.contracts import (
    Artifact,
    NodeExecution,
    NodeOutcome,
    ProducedArtifact,
    incoming_edges,
)
from teacheragent.workflows.execution.implementations import ROLE_IMPLEMENTATIONS
from teacheragent.workflows.execution.nodes import (
    RoleImplementation,
    execute_node,
    gate_ports,
    review_payload,
    single_output,
)
from teacheragent.workflows.execution.readiness import NodeInstance, ready_instances
from teacheragent.workflows.execution.status import RESCHEDULABLE_STATUSES, NodeRunStatus
from teacheragent.workflows.registry import get_definition
from teacheragent.workflows.snapshot import freeze_snapshot


@dataclass(frozen=True, slots=True)
class RunProgress:
    """一次推进的结果。"""

    executed: tuple[NodeInstance, ...] = ()
    waiting: tuple[NodeInstance, ...] = ()
    failed: tuple[NodeInstance, ...] = ()
    paused: bool = False

    @property
    def idle(self) -> bool:
        """这一轮没有跑动任何实例：要么在等决断，要么已经跑完。"""
        return not self.executed and not self.failed


class WorkflowExecutor:
    """一个进程内的执行器：持有能力实现表与暂停集合。"""

    def __init__(self, *, implementations: Mapping[str, RoleImplementation] | None = None) -> None:
        """`implementations` 缺省用默认能力实现表。"""
        self._implementations = dict(implementations or ROLE_IMPLEMENTATIONS)
        self._paused: set[str] = set()

    def open_run(
        self,
        *,
        workflow_id: str,
        run_id: str,
        trigger_message_id: str,
        events: Sequence[Mapping[str, Any]] = (),
        at: datetime | None = None,
    ) -> str:
        """创建一次运行：冻结图快照、写下入口节点的产物与执行行，返回图内容身份。

        触发事件由发起面给出（Tutor 的 proposal）；入口节点的产物就是那批事件本身，
        此后调度从入口的下游开始。
        """
        definition = get_definition(workflow_id)
        snapshot = freeze_snapshot(workflow_id, frozen_at=to_iso(at))
        store.save_snapshot(snapshot, at=at)
        for entry_id in definition.entry_node_ids:
            node = definition.node(entry_id)
            payload = {"capturedAt": to_iso(at), "events": [dict(event) for event in events]}
            store.commit_outcome(
                workflow_id=workflow_id,
                run_id=run_id,
                node_id=entry_id,
                item_key="",
                generation=0,
                graph_hash=snapshot.content_hash,
                status=NodeRunStatus.SUCCEEDED,
                artifacts=(ProducedArtifact(port_id=single_output(node).id, payload=payload),),
                trigger_message_id=trigger_message_id,
                at=at,
            )
        return snapshot.content_hash

    def advance(self, *, workflow_id: str, run_id: str) -> RunProgress:
        """推进一个 run，直到没有可跑的实例、被暂停，或全链跑完。

        代次由每个实例自己的最新行决定，所以局部重跑之后直接再推进一次即可。
        """
        graph_hash = store.run_graph_hash(workflow_id=workflow_id, run_id=run_id)
        definition = store.load_definition(workflow_id=workflow_id, graph_hash=graph_hash)
        executed: list[NodeInstance] = []
        waiting: list[NodeInstance] = []
        failed: list[NodeInstance] = []

        while True:
            if self.is_paused(run_id):
                return RunProgress(tuple(executed), tuple(waiting), tuple(failed), paused=True)
            rows = store.load_artifact_rows(workflow_id=workflow_id, run_id=run_id)
            runs = store.load_run_states(workflow_id=workflow_id, run_id=run_id)
            ready = ready_instances(
                definition,
                instances=self._candidates(definition, rows=rows, run_id=run_id),
                runs=runs,
                artifacts=store.artifact_states(rows),
            )
            if not ready:
                return RunProgress(tuple(executed), tuple(waiting), tuple(failed))

            for instance in ready:
                outcome = self._execute(
                    definition,
                    instance,
                    workflow_id=workflow_id,
                    run_id=run_id,
                    graph_hash=graph_hash,
                    rows=rows,
                )
                if outcome.status is NodeRunStatus.WAITING_HUMAN:
                    waiting.append(instance)
                elif outcome.status is NodeRunStatus.FAILED:
                    failed.append(instance)
                else:
                    executed.append(instance)

    def decide(
        self,
        *,
        workflow_id: str,
        run_id: str,
        node_id: str,
        approved: bool,
        item_key: str = "",
        comments: str = "",
        expected_hash: str | None = None,
        at: datetime | None = None,
    ) -> None:
        """人工决断：把评估写到对应输出端口，并把该门禁置为成功。

        `expected_hash` 是决断人在界面上看到的那一版内容身份；与当前被审产物不一致时
        拒绝这次决断（口径 20 的「冲突即停」），不推进、也不改动任何行。
        """
        graph_hash = store.run_graph_hash(workflow_id=workflow_id, run_id=run_id)
        definition = store.load_definition(workflow_id=workflow_id, graph_hash=graph_hash)
        node = definition.node(node_id)
        rows = store.load_artifact_rows(workflow_id=workflow_id, run_id=run_id)
        inputs = store.load_inputs(definition, node, rows=rows, run_id=run_id, item_key=item_key)
        reviewed = _reviewed_artifact(node, inputs)
        _require_same_version(node_id, reviewed, expected_hash)
        approve, reject = gate_ports(node)
        store.commit_outcome(
            workflow_id=workflow_id,
            run_id=run_id,
            node_id=node_id,
            item_key=item_key,
            generation=store.instance_generation(
                workflow_id=workflow_id, run_id=run_id, node_id=node_id, item_key=item_key
            ),
            graph_hash=graph_hash,
            status=NodeRunStatus.SUCCEEDED,
            artifacts=(
                ProducedArtifact(
                    port_id=approve if approved else reject,
                    payload=review_payload(
                        node=node,
                        decision="approved" if approved else "changes-requested",
                        comments=comments,
                        content_hash=reviewed.content_hash if reviewed else "",
                    ),
                ),
            ),
            at=at,
        )

    def rerun(
        self,
        *,
        workflow_id: str,
        run_id: str,
        node_id: str,
        at: datetime | None = None,
    ) -> tuple[NodeInstance, ...]:
        """从某节点重跑：该节点及其全部下游进新代次，旧代次的行照旧保留。

        写下去的是新代次的 `pending` 行，所以重启后仍然知道哪些实例要重算；
        上游不受影响，它们的产物留在原代次上继续被消费。节点不属于该图时抛
        `UnknownNodeError`，不让一个拼错的 id 静默成「什么都没重跑」。
        """
        graph_hash = store.run_graph_hash(workflow_id=workflow_id, run_id=run_id)
        definition = store.load_definition(workflow_id=workflow_id, graph_hash=graph_hash)
        definition.node(node_id)
        rows = store.load_artifact_rows(workflow_id=workflow_id, run_id=run_id)
        affected: list[NodeInstance] = []
        for node in _downstream_nodes(definition, node_id):
            for item in self._items(definition, node, rows=rows, run_id=run_id):
                store.commit_outcome(
                    workflow_id=workflow_id,
                    run_id=run_id,
                    node_id=node.id,
                    item_key=item,
                    generation=store.instance_generation(
                        workflow_id=workflow_id, run_id=run_id, node_id=node.id, item_key=item
                    )
                    + 1,
                    graph_hash=graph_hash,
                    status=NodeRunStatus.PENDING,
                    at=at,
                )
                affected.append(NodeInstance(node.id, item))
        return tuple(affected)

    def recover(self, *, workflow_id: str | None = None) -> tuple[tuple[str, str], ...]:
        """启动恢复：把非终态的行重新纳入调度，返回受影响的 run。

        `running` 是进程退出时留下的僵尸行，按口径一律回到 `pending` 重新调度，
        没有僵尸 TTL 特判；节点执行本身必须可重入。
        """
        rows = run_repo.list_runs(statuses=[str(status) for status in RESCHEDULABLE_STATUSES])
        affected: set[tuple[str, str]] = set()
        for row in rows:
            if workflow_id is not None and row["workflow_id"] != workflow_id:
                continue
            if row["status"] == str(NodeRunStatus.RUNNING):
                run_repo.upsert_run(
                    workflow_id=row["workflow_id"],
                    run_id=row["run_id"],
                    node_id=row["node_id"],
                    status=str(NodeRunStatus.PENDING),
                    workflow_content_hash=row["workflow_content_hash"],
                    trigger_message_id=row["trigger_message_id"],
                    item_key=row["item_key"],
                    generation=row["generation"],
                    attempt=row["attempt"],
                    error=row["error"],
                )
            affected.add((row["workflow_id"], row["run_id"]))
        return tuple(sorted(affected))

    def pause(self, run_id: str) -> None:
        """暂停一个 run：这是执行器内存里的行为，不落库（口径 26）。"""
        self._paused.add(run_id)

    def resume(self, run_id: str) -> None:
        """继续一个 run：去掉暂停标记，从库里最新的节点状态接着推进。"""
        self._paused.discard(run_id)

    def is_paused(self, run_id: str) -> bool:
        """该 run 是否处于暂停。"""
        return run_id in self._paused

    def _execute(
        self,
        definition: WorkflowDefinition,
        instance: NodeInstance,
        *,
        workflow_id: str,
        run_id: str,
        graph_hash: str,
        rows: Sequence[Mapping[str, Any]],
    ) -> NodeOutcome:
        """执行一个实例并把结果落库；节点自身抛出的执行错误转成失败行。"""
        node = definition.node(instance.node_id)
        generation = store.instance_generation(
            workflow_id=workflow_id,
            run_id=run_id,
            node_id=instance.node_id,
            item_key=instance.item_key,
        )
        execution = NodeExecution(
            definition=definition,
            node=node,
            run_id=run_id,
            item_key=instance.item_key,
            generation=generation,
            inputs=store.load_inputs(
                definition, node, rows=rows, run_id=run_id, item_key=instance.item_key
            ),
        )
        try:
            outcome = execute_node(execution, implementations=self._implementations)
        except NodeExecutionError as error:
            outcome = NodeOutcome(status=NodeRunStatus.FAILED, error=str(error))
        store.commit_outcome(
            workflow_id=workflow_id,
            run_id=run_id,
            node_id=instance.node_id,
            item_key=instance.item_key,
            generation=generation,
            graph_hash=graph_hash,
            status=outcome.status,
            artifacts=outcome.artifacts,
            error=outcome.error,
        )
        return outcome

    def _candidates(
        self,
        definition: WorkflowDefinition,
        *,
        rows: Sequence[Mapping[str, Any]],
        run_id: str,
    ) -> tuple[NodeInstance, ...]:
        """枚举按图上声明可能存在的全部实例：整节点一个，或按条目展开。"""
        return tuple(
            NodeInstance(node.id, item)
            for node in definition.nodes
            for item in self._items(definition, node, rows=rows, run_id=run_id)
        )

    def _items(
        self,
        definition: WorkflowDefinition,
        node: Node,
        *,
        rows: Sequence[Mapping[str, Any]],
        run_id: str,
    ) -> tuple[str, ...]:
        """该节点有哪些条目实例。"""
        if node.kind is NodeKind.FAN_OUT:
            return _expanded_items(definition, node, rows=rows, run_id=run_id)
        approval = node.human_approval
        if approval is not None and approval.per_item and approval.item_port is not None:
            return _item_keys(definition, node, approval.item_port, rows=rows)
        return ("",)


def _expanded_items(
    definition: WorkflowDefinition,
    node: Node,
    *,
    rows: Sequence[Mapping[str, Any]],
    run_id: str,
) -> tuple[str, ...]:
    """fan-out 节点按 `config` 声明的端口、路径与字段展开条目。"""
    port_id = node.config.get(ITEMS_PORT_KEY)
    path = node.config.get(ITEMS_PATH_KEY, "items")
    key_field = node.config.get(ITEM_KEY_FIELD, "id")
    if not isinstance(port_id, str) or not isinstance(path, str) or not isinstance(key_field, str):
        raise NodeExecutionError(
            f"fan-out 节点必须用 config 声明 {ITEMS_PORT_KEY} / {ITEMS_PATH_KEY} / "
            f"{ITEM_KEY_FIELD}：{node.id}"
        )
    payloads = store.load_payloads(
        definition, node, rows=rows, run_id=run_id, item_key="", port_id=port_id
    )
    if not payloads:
        # 上游还没产出：这个节点此刻没有条目实例，不是配置错误。
        return ()
    entries: Any = payloads[0]
    for step in path.split("."):
        entries = entries.get(step) if isinstance(entries, Mapping) else None
    if not isinstance(entries, list):
        raise NodeExecutionError(
            f"fan-out 取不到条目数组：{node.id}.{path}；端口 {port_id} 拿到 "
            f"{len(payloads)} 份正文，首份 {str(payloads[0])[:120]}"
        )
    keys = [str(item[key_field]) for item in entries if isinstance(item, Mapping) and key_field in item]
    if not keys:
        raise NodeExecutionError(f"fan-out 展开后没有条目：{node.id}")
    return tuple(keys)


def _item_keys(
    definition: WorkflowDefinition,
    node: Node,
    port_id: str,
    *,
    rows: Sequence[Mapping[str, Any]],
) -> tuple[str, ...]:
    """逐条门禁的条目：它输入端口上那些按条目分行的产物。"""
    edges = incoming_edges(definition).get((node.id, port_id), ())
    keys = {
        str(row["item_key"])
        for edge in edges
        for row in rows
        if row["node_id"] == edge.source.node_id
        and row["port_id"] == edge.source.port_id
        and row["item_key"]
    }
    return tuple(sorted(keys))


def _reviewed_artifact(node: Node, inputs: Mapping[str, tuple[Artifact, ...]]) -> Artifact | None:
    """该门禁这次审的是哪一份产物：第一个必填输入端口上的第一份。"""
    for port in node.inputs:
        if not port.required:
            continue
        items = inputs.get(port.id, ())
        if items:
            return items[0]
    return None


def _require_same_version(
    node_id: str,
    reviewed: Artifact | None,
    expected_hash: str | None,
) -> None:
    """决断必须落在界面当时看到的那一版内容上；对不上就不动任何行。"""
    if expected_hash is None or reviewed is None:
        return
    if reviewed.content_hash != expected_hash:
        raise NodeExecutionError(
            f"决断的版本与当前产物不一致：{node_id} 期望 {expected_hash}，"
            f"当前 {reviewed.content_hash}"
        )


def _downstream_nodes(definition: WorkflowDefinition, node_id: str) -> tuple[Node, ...]:
    """该节点及其全部下游，按图里的声明顺序返回。"""
    reachable = {node_id}
    changed = True
    while changed:
        changed = False
        for edge in definition.edges:
            if edge.source.node_id in reachable and edge.target.node_id not in reachable:
                reachable.add(edge.target.node_id)
                changed = True
    return tuple(node for node in definition.nodes if node.id in reachable)
