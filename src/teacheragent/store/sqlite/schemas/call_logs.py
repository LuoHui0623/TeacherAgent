"""call_logs 表契约：LLM 调用全量日志。"""

from typing import TypedDict

TABLE = "call_logs"

COLUMNS = (
    "id",
    "role",
    "provider",
    "model",
    "prompt_version_id",
    "input_text",
    "output_text",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "duration_ms",
    "status",
    "error",
    "created_at",
)


class CallLog(TypedDict):
    """call_logs 行。"""

    id: int
    role: str
    provider: str
    model: str
    prompt_version_id: int | None
    input_text: str
    output_text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    duration_ms: int
    status: str
    error: str
    created_at: str
