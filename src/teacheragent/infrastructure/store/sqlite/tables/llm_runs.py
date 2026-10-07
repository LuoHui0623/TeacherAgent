"""`llm_runs` 表契约。"""

from typing import TypedDict


class LlmRunRow(TypedDict):
    """一次真实 provider 请求的持久化行。

    列按语义分组，顺序就是 DDL 顺序。归属那组全部可空：非 workflow 调用（Tutor 对话）
    保持 NULL，`bindings_json` 记下这次调用读了哪些产物版本。
    """

    # 请求身份与序列
    run_id: str
    task_id: str
    query_id: str
    sequence: int
    attempt: int
    role: str

    # 模型与参数
    provider: str
    model: str
    temperature: float

    # 输入
    prompt_sources_json: str
    input_messages_json: str
    tools_json: str

    # 输出与用量
    output_message_json: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

    # 时间与结果
    started_at: str
    completed_at: str
    duration_ms: int
    status: str
    status_code: int | None
    error: str

    # 归属：这次调用属于图上的哪个节点实例
    workflow_id: str | None
    workflow_run_id: str | None
    node_id: str | None
    item_key: str | None
    generation: int | None
    prompt_ref: str | None
    prompt_content_hash: str | None
    bindings_json: str | None


TABLE = "llm_runs"
ROW = LlmRunRow