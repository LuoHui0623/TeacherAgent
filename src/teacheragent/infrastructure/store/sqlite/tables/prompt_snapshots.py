"""`prompt_snapshots` 表契约。"""

from typing import TypedDict


class PromptSnapshotRow(TypedDict):
    """一份提示词资产正文的快照。

    一行一个版本：`ref` 是资产路径（如 `agent/prompts/outline-architect.md`），
    `content_hash` 是内容身份，`add_time` 是该版本被追加的时间。
    按 `ref` 的 `add_time` 序列即该资产的版本历史，提示词 diff 由此读取。
    """

    ref: str
    content_hash: str
    content: str
    add_time: str


TABLE = "prompt_snapshots"
"""表名。"""

ROW = PromptSnapshotRow
"""行契约。"""
