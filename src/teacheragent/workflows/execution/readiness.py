"""就绪判定：由「图 + 执行行 + 产物行」算出可启动的节点实例。

判定是纯函数、与进程内存无关：重启后能算出同一批就绪实例，这是「可继续」的前提。
判定不看时间戳，也不特判僵尸 TTL —— 非终态的实例由调用方重新纳入调度。
实例枚举（fan-out 展开、逐章门禁）由调度器负责，判定只回答「这个实例现在能不能跑」。

代次不在这里处理：调用方先把每个键归约到它的最新代次再交给判定，因此局部重跑就是
「某节点及其下游写进新代次」。输入产物只看直接上游端口落下的行 —— 门禁自己也产出
产物（`GateReview`），所以判定不需要跨过端口回溯，也不需要知道哪个端口是「放行」。
"""

from collections.abc import Sequence
from dataclasses import dataclass

from teacheragent.workflows.contracts import Edge, Node, Port, WorkflowDefinition
from teacheragent.workflows.execution.contracts import incoming_edges
from teacheragent.workflows.execution.status import NodeRunStatus


@dataclass(frozen=True, slots=True)
class NodeInstance:
    """一个待执行的节点实例；`item_key` 为空表示该节点整节点一次执行。"""

    node_id: str
    item_key: str = ""


@dataclass(frozen=True, slots=True)
class RunState:
    """一个实例的执行状态，已归约到它的最新代次。"""

    node_id: str
    item_key: str
    status: NodeRunStatus


@dataclass(frozen=True, slots=True)
class ArtifactState:
    """一份已落库的产物，已归约到它的最新代次。"""

    node_id: str
    port_id: str
    item_key: str
    content_hash: str


def ready_instances(
    definition: WorkflowDefinition,
    *,
    instances: Sequence[NodeInstance],
    runs: Sequence[RunState] = (),
    artifacts: Sequence[ArtifactState] = (),
) -> tuple[NodeInstance, ...]:
    """返回其中可启动的实例，顺序与传入一致。

    可启动 = 该实例尚无行或仍是 `pending`，每个必填输入端口都能取到产物，且这些产物的
    来源实例都已成功。人工门禁未决、正在运行、已终态的实例都不在其中。
    """
    by_node = {node.id: node for node in definition.nodes}
    incoming = incoming_edges(definition)
    return tuple(
        instance
        for instance in instances
        if _is_ready(by_node, incoming, instance, runs, artifacts)
    )


def _is_ready(
    by_node: dict[str, Node],
    incoming: dict[tuple[str, str], tuple[Edge, ...]],
    instance: NodeInstance,
    runs: Sequence[RunState],
    artifacts: Sequence[ArtifactState],
) -> bool:
    node = by_node.get(instance.node_id)
    if node is None:
        return False

    status = _instance_status(runs, instance)
    if status is not None and status is not NodeRunStatus.PENDING:
        return False

    for port in node.inputs:
        if not port.required:
            continue
        if not _port_ready(incoming, instance, port, runs, artifacts):
            return False
    return True


def _port_ready(
    incoming: dict[tuple[str, str], tuple[Edge, ...]],
    instance: NodeInstance,
    port: Port,
    runs: Sequence[RunState],
    artifacts: Sequence[ArtifactState],
) -> bool:
    edges = incoming.get((instance.node_id, port.id), ())
    if not edges:
        # 必填端口没有来源连线是图的问题（定义校验会拦），判定一律不放行而不猜。
        return False

    for edge in edges:
        if not _has_artifact(
            artifacts, edge.source.node_id, edge.source.port_id, instance.item_key
        ):
            return False
        if not _sources_succeeded(runs, edge.source.node_id, instance.item_key):
            return False
    return True


def _has_artifact(
    artifacts: Sequence[ArtifactState],
    node_id: str,
    port_id: str,
    item_key: str,
) -> bool:
    return any(
        row.node_id == node_id
        and row.port_id == port_id
        and item_matches(item_key, row.item_key)
        for row in artifacts
    )


def _sources_succeeded(
    runs: Sequence[RunState],
    node_id: str,
    item_key: str,
) -> bool:
    """来源节点在匹配范围内的实例必须全部成功；一条都没有表示上游还没跑。"""
    matching = [
        row
        for row in runs
        if row.node_id == node_id and item_matches(item_key, row.item_key)
    ]
    return bool(matching) and all(row.status is NodeRunStatus.SUCCEEDED for row in matching)


def _instance_status(
    runs: Sequence[RunState],
    instance: NodeInstance,
) -> NodeRunStatus | None:
    for row in runs:
        if row.node_id == instance.node_id and row.item_key == instance.item_key:
            return row.status
    return None


def item_matches(instance_item: str, candidate_item: str) -> bool:
    """整节点实例接受任意条目；逐条实例只接受整节点行与同条目行。"""
    return instance_item == "" or candidate_item in ("", instance_item)
