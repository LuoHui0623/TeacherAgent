"""图定义注册表：注册 workflow 与它的全部 node_id。

导入 `teacheragent.workflows` 即注册后端持有的全部图定义。运行时拿到 node_id
（例如写 `llm_runs.node_id`）前先用 `require_node()` 校验，未知 id 立即失败，
不落一条归属不明、事后无法归组的调用记录。
"""

from collections.abc import Collection

from teacheragent.workflows.contracts import Node, WorkflowDefinition
from teacheragent.workflows.errors import WorkflowDefinitionError, WorkflowNotFoundError
from teacheragent.workflows.validation import validate_definition

_REGISTRY: dict[str, WorkflowDefinition] = {}


def register_definition(
    definition: WorkflowDefinition,
    *,
    artifact_types: Collection[str] | None = None,
) -> WorkflowDefinition:
    """校验并注册一个图定义；校验失败或 workflow id 已存在时抛 `WorkflowDefinitionError`。"""
    issues = validate_definition(definition, artifact_types=artifact_types)
    if issues:
        detail = "；".join(issue.message for issue in issues)
        raise WorkflowDefinitionError(f"工作流定义无效：{detail}")
    if definition.id in _REGISTRY:
        raise WorkflowDefinitionError(f"工作流已注册：{definition.id}")
    _REGISTRY[definition.id] = definition
    return definition


def get_definition(workflow_id: str) -> WorkflowDefinition:
    """按 id 取已注册的图定义。"""
    try:
        return _REGISTRY[workflow_id]
    except KeyError:
        raise WorkflowNotFoundError(f"未注册的工作流：{workflow_id}") from None


def list_definitions() -> tuple[WorkflowDefinition, ...]:
    """按注册顺序返回全部图定义。"""
    return tuple(_REGISTRY.values())


def registered_node_ids(workflow_id: str) -> frozenset[str]:
    """该工作流注册的全部 node_id。"""
    return get_definition(workflow_id).node_ids


def require_node(workflow_id: str, node_id: str) -> Node:
    """取该工作流上的一个节点；node_id 不属于该图时抛 `UnknownNodeError`。"""
    return get_definition(workflow_id).node(node_id)
