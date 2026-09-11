"""call_logs 表：LLM 调用全量日志。"""

TABLE = "call_logs"

COLUMNS = (
    "id", "role", "provider", "model", "prompt_version_id",
    "input_text", "output_text",
    "prompt_tokens", "completion_tokens", "total_tokens",
    "duration_ms", "status", "error", "created_at",
)


class CallLogRow:
    """call_logs 行模型。"""

    def __init__(self, row: dict) -> None:
        self.id: int = row["id"]
        self.role: str = row["role"]
        self.provider: str = row["provider"]
        self.model: str = row["model"]
        self.prompt_version_id: int | None = row["prompt_version_id"]
        self.input_text: str = row["input_text"]
        self.output_text: str = row["output_text"]
        self.prompt_tokens: int = row["prompt_tokens"]
        self.completion_tokens: int = row["completion_tokens"]
        self.total_tokens: int = row["total_tokens"]
        self.duration_ms: int = row["duration_ms"]
        self.status: str = row["status"]
        self.error: str = row["error"]
        self.created_at: str = row["created_at"]
