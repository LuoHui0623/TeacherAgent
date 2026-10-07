"""图定义正文的反序列化：从落库的图快照还原图定义。

运行中的图结构与注册表解耦：注册表可以继续演化，某次运行只认它创建时冻结的那份快照。
恢复因此不依赖当前代码里的图定义，只依赖 `workflow_snapshots` 的正文。
"""

from collections.abc import Mapping, Sequence
from typing import Any

from teacheragent.workflows.contracts import (
    ApprovalScopeType,
    Edge,
    EdgeEndpoint,
    HumanApproval,
    JsonValue,
    Node,
    NodeKind,
    Port,
    WorkflowDefinition,
)
from teacheragent.workflows.errors import WorkflowDefinitionError


def snapshot_definition(snapshot: Mapping[str, Any]) -> WorkflowDefinition:
    """从图快照正文还原图定义；正文即 `WorkflowSnapshot.to_payload()`。"""
    definition = snapshot.get("definition")
    if not isinstance(definition, Mapping):
        raise WorkflowDefinitionError("图快照缺少 definition 正文")
    version = snapshot.get("version")
    if not isinstance(version, int):
        raise WorkflowDefinitionError(f"图快照的 version 必须是整数：{version!r}")
    return definition_from_payload(definition, version=version)


def definition_from_payload(
    payload: Mapping[str, Any],
    *,
    version: int = 0,
) -> WorkflowDefinition:
    """从图定义正文还原 `WorkflowDefinition`；缺键或取值非法时抛 `WorkflowDefinitionError`。

    `WorkflowDefinition.to_payload()` 不输出 `version`（它由快照携带），因此版本号
    要显式传入；判定只依赖图结构，版本号不影响结果。
    """
    return WorkflowDefinition(
        id=_text(payload, "id"),
        name=_text(payload, "name"),
        description=_text(payload, "description"),
        version=version,
        entry_node_ids=tuple(_text_items(payload, "entryNodeIds")),
        nodes=tuple(_node(item) for item in _mapping_items(payload, "nodes")),
        edges=tuple(_edge(item) for item in _mapping_items(payload, "edges")),
    )


def _node(payload: Mapping[str, Any]) -> Node:
    return Node(
        id=_text(payload, "id"),
        kind=_kind(_text(payload, "kind")),
        label=_text(payload, "label"),
        description=_text(payload, "description"),
        inputs=tuple(_port(item) for item in _mapping_items(payload, "inputs")),
        outputs=tuple(_port(item) for item in _mapping_items(payload, "outputs")),
        role_id=_optional_text(payload, "roleId"),
        prompt_ref=_optional_text(payload, "promptRef"),
        human_approval=_approval(payload.get("humanApproval")),
        config=dict(_mapping_or_empty(payload.get("config"))),
    )


def _port(payload: Mapping[str, Any]) -> Port:
    return Port(
        id=_text(payload, "id"),
        artifact_type=_text(payload, "artifactType"),
        multiple=bool(payload.get("multiple", False)),
        required=bool(payload.get("required", True)),
        description=_text(payload, "description"),
    )


def _edge(payload: Mapping[str, Any]) -> Edge:
    return Edge(
        id=_text(payload, "id"),
        source=_endpoint(payload, "from"),
        target=_endpoint(payload, "to"),
        label=_optional_text(payload, "label"),
        condition=_optional_text(payload, "condition"),
    )


def _endpoint(payload: Mapping[str, Any], key: str) -> EdgeEndpoint:
    endpoint = payload.get(key)
    if not isinstance(endpoint, Mapping):
        raise WorkflowDefinitionError(f"连线端点 {key} 必须是对象：{endpoint!r}")
    return EdgeEndpoint(node_id=_text(endpoint, "nodeId"), port_id=_text(endpoint, "portId"))


def _approval(payload: Any) -> HumanApproval | None:
    if payload is None:
        return None
    if not isinstance(payload, Mapping):
        raise WorkflowDefinitionError(f"审批定义必须是对象：{payload!r}")
    return HumanApproval(
        scope_type=_scope_type(_text(payload, "scopeType")),
        per_item=bool(payload.get("perItem", False)),
        allow_batch=bool(payload.get("allowBatch", False)),
        required=bool(payload.get("required", True)),
        item_port=_optional_text(payload, "itemPort"),
        approved_outcome=_optional_text(payload, "approvedOutcome"),
        changes_outcome=_optional_text(payload, "changesOutcome"),
    )


def _kind(value: str) -> NodeKind:
    try:
        return NodeKind(value)
    except ValueError as error:
        raise WorkflowDefinitionError(f"未知节点类型：{value}") from error


def _scope_type(value: str) -> ApprovalScopeType:
    try:
        return ApprovalScopeType(value)
    except ValueError as error:
        raise WorkflowDefinitionError(f"未知审批范围：{value}") from error


def _text(payload: Mapping[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str):
        raise WorkflowDefinitionError(f"字段 {key} 必须是字符串：{value!r}")
    return value


def _optional_text(payload: Mapping[str, Any], key: str) -> str | None:
    value = payload.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise WorkflowDefinitionError(f"字段 {key} 必须是字符串或不出现：{value!r}")
    return value


def _mapping_items(payload: Mapping[str, Any], key: str) -> Sequence[Mapping[str, Any]]:
    value = payload.get(key, [])
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise WorkflowDefinitionError(f"字段 {key} 必须是数组：{value!r}")
    for item in value:
        if not isinstance(item, Mapping):
            raise WorkflowDefinitionError(f"字段 {key} 的元素必须是对象：{item!r}")
    return value


def _text_items(payload: Mapping[str, Any], key: str) -> Sequence[str]:
    value = payload.get(key, [])
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise WorkflowDefinitionError(f"字段 {key} 必须是字符串数组：{value!r}")
    for item in value:
        if not isinstance(item, str):
            raise WorkflowDefinitionError(f"字段 {key} 的元素必须是字符串：{item!r}")
    return value


def _mapping_or_empty(value: Any) -> Mapping[str, JsonValue]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise WorkflowDefinitionError(f"config 必须是对象：{value!r}")
    return value
