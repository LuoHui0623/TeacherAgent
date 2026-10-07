"""图定义校验：结构、端口类型、连线端点与可达性。

校验规则与前端 `validateWorkflowDefinition()` 同一口径，另加后端独有的
`artifact-types`、`prompt-ref-shape`、`duplicate-port-id`、`invalid-version`。
产物类型词表按 workflow 各自的资产传入：通用图结构不假设某条生产线的词表。
"""

from collections.abc import Collection, Iterable
from dataclasses import dataclass

from teacheragent.workflows.contracts import Node, NodeKind, Port, WorkflowDefinition

PROMPT_REF_PREFIX = "agent/prompts/"


@dataclass(frozen=True, slots=True)
class WorkflowValidationIssue:
    """一条校验失败；`node_id` / `edge_id` 指出出问题的位置（若有）。"""

    code: str
    message: str
    node_id: str | None = None
    edge_id: str | None = None


def validate_definition(
    definition: WorkflowDefinition,
    *,
    artifact_types: Collection[str] | None = None,
) -> tuple[WorkflowValidationIssue, ...]:
    """校验图定义，返回全部问题；`artifact_types` 为 None 时跳过产物类型词表校验。"""
    issues: list[WorkflowValidationIssue] = []
    node_by_id = {node.id: node for node in definition.nodes}

    if definition.version < 1:
        issues.append(
            WorkflowValidationIssue(
                code="invalid-version",
                message=f"图定义版本必须为正整数：{definition.version}",
            )
        )

    for node_id in _duplicates(node.id for node in definition.nodes):
        issues.append(
            WorkflowValidationIssue(
                code="duplicate-node-id",
                message=f"节点 ID 重复：{node_id}",
                node_id=node_id,
            )
        )

    for edge_id in _duplicates(edge.id for edge in definition.edges):
        issues.append(
            WorkflowValidationIssue(
                code="duplicate-edge-id",
                message=f"连线 ID 重复：{edge_id}",
                edge_id=edge_id,
            )
        )

    if not definition.entry_node_ids:
        issues.append(
            WorkflowValidationIssue(
                code="missing-entry",
                message="工作流至少需要一个入口节点",
            )
        )

    for node_id in definition.entry_node_ids:
        if node_id not in node_by_id:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-entry-node",
                    message=f"入口节点不存在：{node_id}",
                    node_id=node_id,
                )
            )

    issues.extend(_validate_nodes(definition, artifact_types=artifact_types))
    issues.extend(_validate_edges(definition, node_by_id))
    issues.extend(_validate_reachability(definition))
    return tuple(issues)


def _validate_nodes(
    definition: WorkflowDefinition,
    *,
    artifact_types: Collection[str] | None,
) -> list[WorkflowValidationIssue]:
    issues: list[WorkflowValidationIssue] = []
    for node in definition.nodes:
        if node.kind is NodeKind.AGENT and node.role_id is None:
            issues.append(
                WorkflowValidationIssue(
                    code="agent-without-role",
                    message=f"Agent 节点缺少 roleId：{node.id}",
                    node_id=node.id,
                )
            )

        if node.kind is NodeKind.AGENT and node.prompt_ref is None:
            issues.append(
                WorkflowValidationIssue(
                    code="agent-without-prompt",
                    message=f"Agent 节点缺少 promptRef：{node.id}",
                    node_id=node.id,
                )
            )

        if node.prompt_ref is not None and not _is_prompt_ref(node.prompt_ref):
            issues.append(
                WorkflowValidationIssue(
                    code="prompt-ref-shape",
                    message=(
                        f"提示词引用必须形如 {PROMPT_REF_PREFIX}<名称>.md："
                        f"{node.id} -> {node.prompt_ref}"
                    ),
                    node_id=node.id,
                )
            )

        if node.kind is NodeKind.HUMAN_GATE and node.human_approval is None:
            issues.append(
                WorkflowValidationIssue(
                    code="human-gate-without-approval",
                    message=f"人工节点缺少审批定义：{node.id}",
                    node_id=node.id,
                )
            )

        issues.extend(_validate_ports(node.id, "inputs", node.inputs, artifact_types))
        issues.extend(_validate_ports(node.id, "outputs", node.outputs, artifact_types))
    return issues


def _validate_ports(
    node_id: str,
    direction: str,
    ports: tuple[Port, ...],
    artifact_types: Collection[str] | None,
) -> list[WorkflowValidationIssue]:
    issues: list[WorkflowValidationIssue] = []

    for port_id in _duplicates(item.id for item in ports):
        issues.append(
            WorkflowValidationIssue(
                code="duplicate-port-id",
                message=f"{direction} 端口 ID 重复：{node_id}.{port_id}",
                node_id=node_id,
            )
        )

    if artifact_types is None:
        return issues

    for item in ports:
        if item.artifact_type not in artifact_types:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-artifact-type",
                    message=(
                        f"端口产物类型不在该工作流的词表中："
                        f"{node_id}.{item.id} -> {item.artifact_type}"
                    ),
                    node_id=node_id,
                )
            )
    return issues


def _validate_edges(
    definition: WorkflowDefinition,
    node_by_id: dict[str, Node],
) -> list[WorkflowValidationIssue]:
    issues: list[WorkflowValidationIssue] = []
    for edge in definition.edges:
        source = node_by_id.get(edge.source.node_id)
        target = node_by_id.get(edge.target.node_id)

        if source is None:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-edge-source",
                    message=f"连线起点节点不存在：{edge.source.node_id}",
                    edge_id=edge.id,
                )
            )
            continue

        if target is None:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-edge-target",
                    message=f"连线终点节点不存在：{edge.target.node_id}",
                    edge_id=edge.id,
                )
            )
            continue

        output_port = source.output_port(edge.source.port_id)
        input_port = target.input_port(edge.target.port_id)

        if output_port is None:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-output-port",
                    message=(
                        f"连线引用了不存在的输出端口："
                        f"{edge.source.node_id}.{edge.source.port_id}"
                    ),
                    edge_id=edge.id,
                )
            )

        if input_port is None:
            issues.append(
                WorkflowValidationIssue(
                    code="unknown-input-port",
                    message=(
                        f"连线引用了不存在的输入端口："
                        f"{edge.target.node_id}.{edge.target.port_id}"
                    ),
                    edge_id=edge.id,
                )
            )

        if (
            output_port is not None
            and input_port is not None
            and output_port.artifact_type != input_port.artifact_type
        ):
            issues.append(
                WorkflowValidationIssue(
                    code="artifact-type-mismatch",
                    message=(
                        f"连线产物类型不匹配："
                        f"{output_port.artifact_type} -> {input_port.artifact_type}"
                    ),
                    edge_id=edge.id,
                )
            )
    return issues


def _validate_reachability(definition: WorkflowDefinition) -> list[WorkflowValidationIssue]:
    reachable: set[str] = set()
    queue = list(definition.entry_node_ids)
    while queue:
        current = queue.pop()
        if current in reachable:
            continue
        reachable.add(current)
        queue.extend(
            edge.target.node_id for edge in definition.edges if edge.source.node_id == current
        )

    return [
        WorkflowValidationIssue(
            code="unreachable-node",
            message=f"节点不可达：{node.id}",
            node_id=node.id,
        )
        for node in definition.nodes
        if node.id not in reachable
    ]


def _duplicates(values: Iterable[str]) -> list[str]:
    """按出现顺序返回重复值，每个重复值只报一次。"""
    seen: set[str] = set()
    duplicates: list[str] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return duplicates


def _is_prompt_ref(ref: str) -> bool:
    if not ref.startswith(PROMPT_REF_PREFIX) or not ref.endswith(".md"):
        return False
    parts = ref.split("/")
    return len(parts) == 3 and bool(parts[-1][:-3])
