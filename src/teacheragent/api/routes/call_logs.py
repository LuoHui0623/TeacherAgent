"""LLM 调用日志 API。"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from teacheragent.infrastructure.store import repositories


router = APIRouter(prefix="/llm")


class CallLogRead(BaseModel):
    """提示词地图所需的调用审计字段。"""

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


@router.get("/call-logs")
def list_call_logs(
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, list[dict]]:
    """按调用发生时间返回最近的 LLM 调用记录。"""
    return {
        "logs": [
            CallLogRead(**row).model_dump()
            for row in repositories.call_logs.list_recent(limit)
        ]
    }
