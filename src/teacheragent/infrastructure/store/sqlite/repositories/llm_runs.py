"""`llm_runs` 仓储：真实模型请求的创建、完成和查询。"""

import json
from typing import Any

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import llm_runs as table
from teacheragent.infrastructure.store.sqlite.tables.llm_runs import LlmRunRow


def create_run(*, run: dict[str, Any]) -> None:
    """以 running 状态创建一条真实请求记录。"""
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} ("
            "run_id, task_id, query_id, sequence, attempt, role, provider, model, temperature, "
            "prompt_sources_json, input_messages_json, tools_json, started_at, status"
            ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                run["run_id"], run["task_id"], run["query_id"], run["sequence"],
                run["attempt"], run["role"], run["provider"], run["model"],
                run["temperature"], json.dumps(run["prompt_sources"], ensure_ascii=False),
                json.dumps(run["input_messages"], ensure_ascii=False),
                json.dumps(run.get("tools") or [], ensure_ascii=False),
                run["started_at"], "running",
            ),
        )


def finish_run(*, run_id: str, values: dict[str, Any]) -> None:
    """更新 running 记录的结果字段。"""
    with connection() as conn:
        conn.execute(
            f"UPDATE {table.TABLE} SET output_message_json = ?, prompt_tokens = ?, "
            "completion_tokens = ?, total_tokens = ?, completed_at = ?, duration_ms = ?, "
            "status = ?, status_code = ?, error = ? WHERE run_id = ?",
            (
                json.dumps(values.get("output_message") or {}, ensure_ascii=False),
                values.get("prompt_tokens", 0), values.get("completion_tokens", 0),
                values.get("total_tokens", 0), values["completed_at"], values["duration_ms"],
                values["status"], values.get("status_code"), values.get("error", ""), run_id,
            ),
        )


def list_runs(*, limit: int = 100, run_id: str | None = None, task_id: str | None = None,
              query_id: str | None = None, role: str | None = None, model: str | None = None,
              source_hash: str | None = None) -> list[LlmRunRow]:
    """按常用索引字段过滤并返回最近运行记录。"""
    clauses: list[str] = []
    params: list[Any] = []
    for name, value in (("run_id", run_id), ("task_id", task_id), ("query_id", query_id),
                        ("role", role), ("model", model)):
        if value is not None:
            clauses.append(f"{name} = ?")
            params.append(value)
    if source_hash is not None:
        clauses.append("prompt_sources_json LIKE ?")
        params.append(f"%{source_hash}%")
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with connection() as conn:
        return [dict(row) for row in conn.execute(
            f"SELECT * FROM {table.TABLE}{where} ORDER BY started_at DESC LIMIT ?", params
        )]