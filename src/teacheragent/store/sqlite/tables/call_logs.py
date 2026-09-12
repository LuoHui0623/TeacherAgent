"""call_logs 表契约。"""

from typing import TypedDict


class CallLogRow(TypedDict):
    """`call_logs` 行。

    `prompt_ref` 存提示词资产的相对路径（如 `prompts/teacher.md`）；
    提示词内容由 git 版本化，不入库。
    """

    id: int
    role: str
    provider: str
    model: str
    prompt_ref: str | None
    input_text: str
    output_text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    duration_ms: int
    status: str
    error: str
    created_at: str


TABLE = "call_logs"
"""表名。"""

ROW = CallLogRow
"""行契约，供 `tests/test_table_contracts.py` 与 DDL 交叉校验。"""
