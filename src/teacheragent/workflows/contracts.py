"""工作流图定义契约：端口、节点、连线与运行冻结的图快照。

图定义由后端持有，前端只做只读投影。`to_payload()` 输出的 JSON 与前端
`WorkflowDefinition` 类型同构（键名用 camelCase），是 canvas 的唯一图结构来源；
节点 id 同时是运行记录归属节点的 join key。
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from types import MappingProxyType
from typing import Any, Final, TypeAlias

from teacheragent.workflows.errors import UnknownNodeError

JsonPrimitive: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonPrimitive | list["JsonValue"] | dict[str, "JsonValue"]

APPROVE_PORT_KEY: Final[str] = "approvePort"
"""节点 `config` 声明「通过」写到哪个输出端口。门禁必须声明。"""

REJECT_PORT_KEY: Final[str] = "rejectPort"
"""节点 `config` 声明「否决」写到哪个输出端口。门禁必须声明。"""

ITEMS_PORT_KEY: Final[str] = "itemsFrom"
"""节点 `config` 声明 fan-out 从哪个输入端口取条目。"""

ITEMS_PATH_KEY: Final[str] = "itemsPath"
"""节点 `config` 声明条目数组在产物正文里的点分路径。"""

ITEM_KEY_FIELD: Final[str] = "itemKey"
"""节点 `config` 声明条目里的哪个字段做 `item_key`。"""


class NodeKind(StrEnum):
    """图节点类型的分类，用于校验强制字段与前端呈现。

    取值集合与前端 `WorkflowNodeKind` 一一对应：前端 `kindLabels` / `nodeIcon` 是
    穷尽 Record，少一个取值就编译失败，所以两侧必须同时增删。取值不统一在一条轴上：
    有的命名执行者（`AGENT`、`TOOL`、`HUMAN_GATE`、`TRIGGER`），有的命名机制
    （`CONTEXT`、`CONTRACT_GATE`、`ROUTER`、`FAN_OUT`、`FAN_IN`、`QUALITY_LOOP`），
    有的命名副作用（`PERSIST`、`NOTIFY`）。`kind` 目前不是执行分派键。

    两个取值带强制字段：`AGENT` 必须有 `role_id` 与 `prompt_ref`，`HUMAN_GATE`
    必须有 `human_approval`（见 `validation.py`）。逐值语义见 `workflows/README.md`。
    """

    TRIGGER = "trigger"
    CONTEXT = "context"
    AGENT = "agent"
    CONTRACT_GATE = "contract-gate"
    HUMAN_GATE = "human-gate"
    ROUTER = "router"
    FAN_OUT = "fan-out"
    FAN_IN = "fan-in"
    QUALITY_LOOP = "quality-loop"
    TOOL = "tool"
    PERSIST = "persist"
    NOTIFY = "notify"


class ApprovalScopeType(StrEnum):
    """人工门禁的审批范围。"""

    WORKFLOW = "workflow"
    OUTLINE = "outline"
    CHAPTER = "chapter"
    PUBLISH = "publish"


@dataclass(frozen=True, slots=True)
class Port:
    """节点的一个输入或输出端口；`artifact_type` 决定该端口能连接的产物类型。"""

    id: str
    artifact_type: str
    multiple: bool = False
    required: bool = True
    description: str = ""

    def to_payload(self) -> dict[str, Any]:
        """投影为前端 `PortDefinition`。"""
        return {
            "id": self.id,
            "artifactType": self.artifact_type,
            "required": self.required,
            "multiple": self.multiple,
            "description": self.description,
        }


def port(
    port_id: str,
    artifact_type: str,
    *,
    multiple: bool = False,
    required: bool = True,
) -> Port:
    """构造端口；描述默认取产物类型名，与前端的端口构造口径一致。"""
    return Port(
        id=port_id,
        artifact_type=artifact_type,
        multiple=multiple,
        required=required,
        description=artifact_type,
    )


@dataclass(frozen=True, slots=True)
class HumanApproval:
    """人工门禁的审批范围与决策口径。"""

    scope_type: ApprovalScopeType
    per_item: bool = False
    allow_batch: bool = False
    required: bool = True
    item_port: str | None = None
    approved_outcome: str | None = None
    changes_outcome: str | None = None

    def to_payload(self) -> dict[str, Any]:
        """投影为前端 `HumanApprovalDefinition`。"""
        payload: dict[str, Any] = {
            "scopeType": str(self.scope_type),
            "perItem": self.per_item,
            "allowBatch": self.allow_batch,
            "required": self.required,
        }
        optional = (
            ("itemPort", self.item_port),
            ("approvedOutcome", self.approved_outcome),
            ("changesOutcome", self.changes_outcome),
        )
        for key, value in optional:
            if value is not None:
                payload[key] = value
        return payload


@dataclass(frozen=True, slots=True)
class Node:
    """图上的一个节点。

    `role_id` 是工作流内部的节点角色名，不是 `AgentRole`（模型 role 仍只有 tutor
    与 curriculum）。`prompt_ref` 用可加载的资产路径 `agent/prompts/<名称>.md`，
    与 `load_prompt()` 同一命名空间，运行记录里的 prompt_ref 可直接取正文。
    """

    # 身份
    id: str
    kind: NodeKind
    label: str
    description: str

    # 端口
    inputs: tuple[Port, ...] = ()
    outputs: tuple[Port, ...] = ()

    # 执行者与提示词
    role_id: str | None = None
    prompt_ref: str | None = None
    human_approval: HumanApproval | None = None

    # 节点控制项
    config: Mapping[str, JsonValue] = field(default_factory=lambda: MappingProxyType({}))

    def __post_init__(self) -> None:
        object.__setattr__(self, "config", MappingProxyType(dict(self.config)))

    def input_port(self, port_id: str) -> Port | None:
        """按 id 取输入端口。"""
        return _find_port(self.inputs, port_id)

    def output_port(self, port_id: str) -> Port | None:
        """按 id 取输出端口。"""
        return _find_port(self.outputs, port_id)

    def to_payload(self) -> dict[str, Any]:
        """投影为前端 `WorkflowNodeDefinition`，缺省字段按前端可选语义省略。"""
        payload: dict[str, Any] = {
            "id": self.id,
            "kind": str(self.kind),
            "label": self.label,
            "description": self.description,
            "inputs": [item.to_payload() for item in self.inputs],
            "outputs": [item.to_payload() for item in self.outputs],
            "config": dict(self.config),
        }
        if self.role_id is not None:
            payload["roleId"] = self.role_id
        if self.prompt_ref is not None:
            payload["promptRef"] = self.prompt_ref
        if self.human_approval is not None:
            payload["humanApproval"] = self.human_approval.to_payload()
        return payload


def _find_port(ports: tuple[Port, ...], port_id: str) -> Port | None:
    for item in ports:
        if item.id == port_id:
            return item
    return None


@dataclass(frozen=True, slots=True)
class EdgeEndpoint:
    """连线的一端：节点 id 加该节点上的端口 id。"""

    node_id: str
    port_id: str

    def to_payload(self) -> dict[str, str]:
        """投影为前端 `EdgeEndpoint`。"""
        return {"nodeId": self.node_id, "portId": self.port_id}


@dataclass(frozen=True, slots=True)
class Edge:
    """两个端口之间的一条连线；`condition` 是分支口径，无分支时与 `label` 同值。"""

    id: str
    source: EdgeEndpoint
    target: EdgeEndpoint
    label: str | None = None
    condition: str | None = None

    def to_payload(self) -> dict[str, Any]:
        """投影为前端 `WorkflowEdgeDefinition`。"""
        payload: dict[str, Any] = {
            "id": self.id,
            "from": self.source.to_payload(),
            "to": self.target.to_payload(),
        }
        if self.label is not None:
            payload["label"] = self.label
        if self.condition is not None:
            payload["condition"] = self.condition
        return payload


@dataclass(frozen=True, slots=True)
class WorkflowDefinition:
    """一个 workflow 的图定义。

    `version` 由作者维护，内容变更时必须递增；`content_hash` 是不依赖人工的
    内容身份，两者一起进图快照。节点位置由前端布局决定，不在此描述。
    """

    id: str
    name: str
    description: str
    version: int
    entry_node_ids: tuple[str, ...]
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]

    @property
    def node_ids(self) -> frozenset[str]:
        """该图注册的全部节点 id。"""
        return frozenset(node.id for node in self.nodes)

    def node(self, node_id: str) -> Node:
        """按 id 取节点；id 不属于本图时抛 `UnknownNodeError`。"""
        for node in self.nodes:
            if node.id == node_id:
                return node
        raise UnknownNodeError(f"工作流 {self.id} 不存在节点：{node_id}")

    def to_payload(self) -> dict[str, Any]:
        """投影为前端 `WorkflowDefinition`。"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "entryNodeIds": list(self.entry_node_ids),
            "nodes": [node.to_payload() for node in self.nodes],
            "edges": [edge.to_payload() for edge in self.edges],
        }


@dataclass(frozen=True, slots=True)
class WorkflowSnapshot:
    """一次运行冻结的图：内容哈希、版本标签和图定义 JSON。

    `frozen_at` 之后图定义再变也不影响该运行；`definition` 即运行记录要落库的
    图快照正文。
    """

    workflow_id: str
    version: int
    content_hash: str
    node_ids: frozenset[str]
    definition: Mapping[str, JsonValue]
    frozen_at: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "definition", MappingProxyType(dict(self.definition)))

    def to_payload(self) -> dict[str, Any]:
        """投影为可落库、可返回给前端的图快照 JSON。"""
        return {
            "workflowId": self.workflow_id,
            "version": self.version,
            "contentHash": self.content_hash,
            "nodeIds": sorted(self.node_ids),
            "definition": dict(self.definition),
            "frozenAt": self.frozen_at,
        }
