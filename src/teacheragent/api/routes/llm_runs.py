"""LLM 运行记录 API：真实请求的查询与提示词地图取数。"""

import json

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from teacheragent.infrastructure.store import repositories


router = APIRouter(prefix="/llm")


class PromptMapCallRead(BaseModel):
    """提示词地图所需的调用字段，取自 `llm_runs`。

    `node_id` 为 NULL 表示这次调用不属于任何图节点（Tutor 对话）；`prompt_sources`
    是这次调用实际用到的提示词资产与其内容身份。
    """

    id: str
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
    node_id: str | None = None
    prompt_sources: list[dict] = Field(default_factory=list)


@router.get("/call-logs")
def list_call_logs(
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, list[dict]]:
    """按调用发生时间返回最近的真实请求，供提示词地图取数。"""
    return {
        "logs": [
            PromptMapCallRead(
                id=row["run_id"],
                role=row["role"],
                provider=row["provider"],
                model=row["model"],
                input_text=row["input_messages_json"],
                output_text=_message_content(row["output_message_json"]),
                prompt_tokens=row["prompt_tokens"],
                completion_tokens=row["completion_tokens"],
                total_tokens=row["total_tokens"],
                duration_ms=row["duration_ms"],
                status=row["status"],
                error=row["error"],
                created_at=row["started_at"],
                node_id=row["node_id"],
                prompt_sources=_prompt_sources(row["prompt_sources_json"]),
            ).model_dump()
            for row in repositories.llm_runs.list_runs(limit=limit)
        ]
    }


def _prompt_sources(raw: str) -> list[dict]:
    """解析落库的提示词来源；非 workflow 调用是空数组。"""
    parsed = json.loads(raw) if raw else []
    return parsed if isinstance(parsed, list) else []


def _message_content(raw: str) -> str:
    """从落库的消息体提取文本内容。"""
    message = json.loads(raw) if raw else {}
    content = message.get("content", "") if isinstance(message, dict) else ""
    return content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)


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
        limit=limit,
        run_id=run_id,
        task_id=task_id,
        query_id=query_id,
        role=role,
        model=model,
        source_hash=source_hash,
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
            "run_id",
            "task_id",
            "query_id",
            "sequence",
            "attempt",
            "role",
            "provider",
            "model",
            "temperature",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "started_at",
            "completed_at",
            "duration_ms",
            "status",
            "status_code",
        )
    }