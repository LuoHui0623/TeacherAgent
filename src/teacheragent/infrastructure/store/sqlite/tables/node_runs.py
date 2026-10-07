"""`node_runs` 表契约。"""

from typing import TypedDict


class NodeRunRow(TypedDict):
    """一次节点执行的事实。

    没有运行头表：run 是共享 `(workflow_id, run_id)` 的一组行，状态、起止与耗时
    都由这组行按 `event_time` 派生。`event_time` 是该行最近一次状态写入时刻。
    """

    # 执行身份：哪条流程的第几次运行的哪个实例
    workflow_id: str
    run_id: str
    node_id: str
    item_key: str
    generation: int

    # run 级冗余：只在首次写入时落值
    workflow_content_hash: str
    trigger_message_id: str | None

    # 状态与时间
    status: str
    attempt: int
    event_time: str
    error: str


TABLE = "node_runs"
"""表名。"""

ROW = NodeRunRow
"""行契约。"""
