"""节点执行的输入输出契约。

执行器只认这些结构，不认仓储的行形状；行与领域对象之间的转换集中在 `execution/store.py`。
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any

from teacheragent.workflows.contracts import Edge, Node, WorkflowDefinition
from teacheragent.workflows.execution.status import NodeRunStatus


@dataclass(frozen=True, slots=True)
class Artifact:
    """一个已落库的产物。"""

    node_id: str
    port_id: str
    item_key: str
    generation: int
    content_hash: str
    payload: Any


@dataclass(frozen=True, slots=True)
class ProducedArtifact:
    """一次执行要写下的产物；`content_hash` 由执行器按正文算出，不由节点给。"""

    port_id: str
    payload: Any


@dataclass(frozen=True, slots=True)
class NodeExecution:
    """一次节点执行的输入：图、节点、运行身份与按输入端口归好的产物。"""

    definition: WorkflowDefinition
    node: Node
    run_id: str
    item_key: str
    generation: int
    inputs: Mapping[str, tuple[Artifact, ...]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "inputs", MappingProxyType(dict(self.inputs)))

    def artifacts_for(self, port_id: str) -> tuple[Artifact, ...]:
        """取某个输入端口上的全部产物；端口没有产物时返回空元组。"""
        return self.inputs.get(port_id, ())

    def payload(self, port_id: str) -> Any:
        """取某个输入端口的第一份产物正文；端口没有产物时返回 None。"""
        items = self.artifacts_for(port_id)
        return items[0].payload if items else None

    def payloads(self, port_id: str) -> tuple[Any, ...]:
        """取某个输入端口上的全部产物正文。"""
        return tuple(item.payload for item in self.artifacts_for(port_id))


@dataclass(frozen=True, slots=True)
class NodeOutcome:
    """一次执行的产出：终态与要写下的产物。"""

    status: NodeRunStatus
    artifacts: tuple[ProducedArtifact, ...] = ()
    error: str = ""


def input_bindings(
    definition: WorkflowDefinition,
    node: Node,
) -> Mapping[str, tuple[tuple[str, str], ...]]:
    """按输入端口列出该节点的产物来源 `<来源节点, 来源端口>`。

    端口可能来自多条连线（例如同时接草稿与审校报告），来源顺序即连线在图中声明的顺序。
    """
    grouped: dict[str, list[tuple[str, str]]] = {port.id: [] for port in node.inputs}
    for edge in definition.edges:
        if edge.target.node_id != node.id:
            continue
        grouped.setdefault(edge.target.port_id, []).append(
            (edge.source.node_id, edge.source.port_id)
        )
    return {port_id: tuple(sources) for port_id, sources in grouped.items()}


def incoming_edges(
    definition: WorkflowDefinition,
) -> Mapping[tuple[str, str], tuple[Edge, ...]]:
    """按 `<目标节点, 目标端口>` 归好该端口上的入边，顺序即声明顺序。"""
    grouped: dict[tuple[str, str], list[Edge]] = {}
    for edge in definition.edges:
        grouped.setdefault((edge.target.node_id, edge.target.port_id), []).append(edge)
    return {key: tuple(value) for key, value in grouped.items()}
