"""节点执行状态词表：`node_runs.status` 的取值与集合划分。

run 没有状态列，它的状态由这一组行派生；恢复扫描只看非终态行 —— 口径是「非终态即
重新纳入调度」，不做僵尸 TTL 特判。
"""

from collections.abc import Iterable
from enum import StrEnum
from typing import Final


class NodeRunStatus(StrEnum):
    """一次节点执行的状态。"""

    PENDING = "pending"
    RUNNING = "running"
    WAITING_HUMAN = "waiting-human"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


TERMINAL_STATUSES: Final[frozenset[NodeRunStatus]] = frozenset(
    {NodeRunStatus.SUCCEEDED, NodeRunStatus.FAILED, NodeRunStatus.CANCELLED}
)
"""终态：不再推进，也不重新调度。"""

RESCHEDULABLE_STATUSES: Final[frozenset[NodeRunStatus]] = frozenset(
    {NodeRunStatus.PENDING, NodeRunStatus.RUNNING}
)
"""重启后重新纳入调度的状态；`running` 是进程退出时留下的僵尸行，同样重新调度。"""

WAITING_STATUSES: Final[frozenset[NodeRunStatus]] = frozenset({NodeRunStatus.WAITING_HUMAN})
"""等待人工决断：由用户动作唤醒，恢复扫描不改写它。"""


def aggregate_status(statuses: Iterable[NodeRunStatus]) -> NodeRunStatus:
    """把一组节点执行行的状态归并成一个整体状态。

    run 与节点的多条目汇总都用它：失败压过一切，其次是取消、等待人工决断，仍有
    待推进的行就是还在跑，没有行才算尚未开始。
    """
    seen = set(statuses)
    if not seen:
        return NodeRunStatus.PENDING
    for candidate in (NodeRunStatus.FAILED, NodeRunStatus.CANCELLED, NodeRunStatus.WAITING_HUMAN):
        if candidate in seen:
            return candidate
    if seen == {NodeRunStatus.PENDING}:
        return NodeRunStatus.PENDING
    if seen & RESCHEDULABLE_STATUSES:
        return NodeRunStatus.RUNNING
    return NodeRunStatus.SUCCEEDED
