"""LLM 调用日志 API。"""

import json
from fastapi import APIRouter, HTTPException, Query
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


@router.get("/runs")
def list_llm_runs(
    run_id: str | None = None,
    task_id: str | None = None,
    query_id: str | None = None,
    role: str | None = None,
    model: str | None = None,
    source_hash: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, list[dict]]:
    """查询运行记录摘要；完整 prompt 和消息只在详情接口返回。"""
    rows = repositories.llm_runs.list_runs(
        limit=limit, run_id=run_id, task_id=task_id, query_id=query_id,
        role=role, model=model, source_hash=source_hash,
    )
    return {"runs": [_summary(row) for row in rows]}


@router.get("/runs/{run_id}")
def get_llm_run(run_id: str) -> dict:
    """返回单次真实请求的完整输入、来源、输出和用量快照。"""
    rows = repositories.llm_runs.list_runs(run_id=run_id, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="llm run not found")
    row = rows[0]
    return {
        **_summary(row),
        "prompt_sources": json.loads(row["prompt_sources_json"]),
        "input_messages": json.loads(row["input_messages_json"]),
        "tools": json.loads(row["tools_json"]),
        "output_message": json.loads(row["output_message_json"]),
        "error": row["error"],
    }


def _summary(row: dict) -> dict:
    return {
        key: row[key]
        for key in (
            "run_id", "task_id", "query_id", "sequence", "attempt", "role",
            "provider", "model", "temperature", "prompt_tokens", "completion_tokens",
            "total_tokens", "started_at", "completed_at", "duration_ms", "status",
            "status_code",
        )
    }
