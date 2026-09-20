"""call_logs 表契约。"""

from typing import TypedDict


class CallLogRow(TypedDict):
    """`call_logs` 行。

    这是 LLM 调用审计记录；提示词模板由提示词资产与 workflow 侧管理，
    不作为调用日志字段持久化。
    """

    id: int
    role: str
    provider: str
    model: str
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
