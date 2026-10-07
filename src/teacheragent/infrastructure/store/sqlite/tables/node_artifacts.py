"""`node_artifacts` 表契约。"""

from typing import TypedDict


class NodeArtifactRow(TypedDict):
    """一次节点执行产出的一个产物。

    `port_id` 是命中的输出端口，一次执行产出多个产物就是同一 `node_runs` 行的多行产物。
    `event_time` 是这个产物被产出的时刻（运行期事实，与 `node_runs.event_time` 同一口径）。
    `payload_json` 是产物正文。

    人工门禁的决断不在这张表上：门禁自己产出的 `GateReview` 行（`reviewer` / `decision` /
    `comments` / `contentHash`）就是决断记录，因此不需要另设确认列。
    """

    # 产物身份：哪次执行在哪个端口产出的哪一份
    workflow_id: str
    run_id: str
    node_id: str
    item_key: str
    port_id: str
    generation: int

    # 正文与内容身份
    payload_json: str
    content_hash: str

    # 产出时刻
    event_time: str


TABLE = "node_artifacts"
"""表名。"""

ROW = NodeArtifactRow
"""行契约。"""
