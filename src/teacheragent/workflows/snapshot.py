"""图快照冻结：把图定义固化成带内容哈希的不可变记录。

运行开始时冻结一次，之后图定义再变也不影响该运行。`content_hash` 覆盖图定义
正文（规范化 JSON 的 SHA-256），与提示词、产物的内容身份同一口径。
"""

from datetime import UTC, datetime

from teacheragent.shared.digest import content_hash
from teacheragent.workflows.contracts import WorkflowDefinition, WorkflowSnapshot
from teacheragent.workflows.registry import get_definition


def freeze_definition(
    definition: WorkflowDefinition,
    *,
    frozen_at: str | None = None,
) -> WorkflowSnapshot:
    """冻结构建中或未注册的图定义；`frozen_at` 缺省取当前 UTC 时间。"""
    payload = definition.to_payload()
    return WorkflowSnapshot(
        workflow_id=definition.id,
        version=definition.version,
        content_hash=content_hash(payload),
        node_ids=definition.node_ids,
        definition=payload,
        frozen_at=frozen_at if frozen_at is not None else _utc_now(),
    )


def freeze_snapshot(workflow_id: str, *, frozen_at: str | None = None) -> WorkflowSnapshot:
    """冻结一个已注册工作流的当前图定义。"""
    return freeze_definition(get_definition(workflow_id), frozen_at=frozen_at)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
