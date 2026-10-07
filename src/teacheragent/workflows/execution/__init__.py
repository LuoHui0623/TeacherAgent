"""工作流执行层：状态词表、就绪判定、节点执行与调度。

执行器在内存里维护节点实例的运行时状态，库是它的持久化：执行事实与产物在同一事务里提交，
进程重启后从库里的行重建状态继续推进。暂停 / 继续是内存行为，重跑用 `generation` 追加新代次。
"""

from teacheragent.workflows.execution.contracts import (
    Artifact,
    NodeExecution,
    NodeOutcome,
    ProducedArtifact,
)
from teacheragent.workflows.execution.implementations import ROLE_IMPLEMENTATIONS
from teacheragent.workflows.execution.nodes import (
    RoleImplementation,
    execute_node,
    gate_ports,
    review_payload,
)
from teacheragent.workflows.execution.readiness import (
    ArtifactState,
    NodeInstance,
    RunState,
    item_matches,
    ready_instances,
)
from teacheragent.workflows.execution.scheduler import RunProgress, WorkflowExecutor
from teacheragent.workflows.execution.start import StartedRun, start_run
from teacheragent.workflows.execution.status import (
    RESCHEDULABLE_STATUSES,
    TERMINAL_STATUSES,
    WAITING_STATUSES,
    NodeRunStatus,
)

__all__ = [
    "Artifact",
    "ArtifactState",
    "NodeExecution",
    "NodeInstance",
    "NodeOutcome",
    "NodeRunStatus",
    "ProducedArtifact",
    "RESCHEDULABLE_STATUSES",
    "ROLE_IMPLEMENTATIONS",
    "RoleImplementation",
    "RunProgress",
    "RunState",
    "StartedRun",
    "TERMINAL_STATUSES",
    "WAITING_STATUSES",
    "WorkflowExecutor",
    "execute_node",
    "gate_ports",
    "item_matches",
    "ready_instances",
    "review_payload",
    "start_run",
]
