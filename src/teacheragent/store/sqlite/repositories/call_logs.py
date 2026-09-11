"""call_logs 仓储：调用日志写入。"""

from teacheragent.store.sqlite import database
from teacheragent.store.sqlite.schemas import call_logs as schema


def insert_log(
    *,
    role: str,
    provider: str,
    model: str,
    input_text: str,
    output_text: str = "",
    usage: dict | None = None,
    duration_ms: int = 0,
    status: str = "ok",
    error: str = "",
    prompt_version_id: int | None = None,
) -> int:
    """写入一条调用日志，返回自增 id。"""
    tokens = usage or {}
    return database.execute(
        f"INSERT INTO {schema.TABLE} "
        "(role, provider, model, prompt_version_id, input_text, output_text, "
        "prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            role,
            provider,
            model,
            prompt_version_id,
            input_text,
            output_text,
            tokens.get("prompt_tokens", 0),
            tokens.get("completion_tokens", 0),
            tokens.get("total_tokens", 0),
            duration_ms,
            status,
            error,
        ),
    )


def count_by_role(role: str) -> int:
    """某角色的调用次数（用于成本统计与测试断言）。"""
    rows = database.query(
        f"SELECT COUNT(*) AS n FROM {schema.TABLE} WHERE role = ?", (role,)
    )
    return rows[0]["n"] if rows else 0
