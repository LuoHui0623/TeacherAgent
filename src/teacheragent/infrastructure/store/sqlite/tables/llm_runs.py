"""`llm_runs` 表契约。"""

from typing import TypedDict


class LlmRunRow(TypedDict):
    """一次真实 provider 请求的持久化行。"""

    run_id: str
    task_id: str
    query_id: str
    sequence: int
    attempt: int
    role: str
    provider: str
    model: str
    temperature: float
    prompt_sources_json: str
    input_messages_json: str
    tools_json: str
    output_message_json: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    started_at: str
    completed_at: str
    duration_ms: int
    status: str
    status_code: int | None
    error: str


TABLE = "llm_runs"
ROW = LlmRunRow