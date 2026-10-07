"""`workflow_snapshots` 表契约。"""

from typing import TypedDict


class WorkflowSnapshotRow(TypedDict):
    """一个 workflow 的图定义正文快照。

    一行一个版本：`content_hash` 是内容身份，`add_time` 是该版本被追加的时间；
    `snapshot_json` 是图快照正文（`WorkflowSnapshot.to_payload()`），由它解析出
    那次运行使用的图结构。同 `(workflow_id, content_hash)` 只写一次，重复冻结不产生新行。
    """

    workflow_id: str
    content_hash: str
    snapshot_json: str
    add_time: str


TABLE = "workflow_snapshots"
"""表名。"""

ROW = WorkflowSnapshotRow
"""行契约。"""
