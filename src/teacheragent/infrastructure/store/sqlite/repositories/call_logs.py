"""call_logs 仓储：调用日志写入与查询。"""

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import call_logs as table
from teacheragent.infrastructure.store.sqlite.tables.call_logs import CallLogRow


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
) -> int:
    """写入一条调用日志，返回自增 id。"""
    tokens = usage or {}
    with connection() as conn:
        cursor = conn.execute(
            f"INSERT INTO {table.TABLE} "
            "(role, provider, model, input_text, output_text, "
            "prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                role,
                provider,
                model,
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
        return cursor.lastrowid or 0


def list_by_role(role: str, limit: int = 100) -> list[CallLogRow]:
    """按角色倒序列出调用日志（成本统计与日志查阅）。"""
    return _query(
        f"SELECT * FROM {table.TABLE} WHERE role = ? ORDER BY id DESC LIMIT ?",
        (role, limit),
    )


def list_recent(limit: int = 100) -> list[CallLogRow]:
    """按发生时间正序列出最近调用，供提示词地图的时间流展示。"""
    return _query(
        f"SELECT * FROM ("
        f"SELECT * FROM {table.TABLE} ORDER BY created_at DESC, id DESC LIMIT ?"
        f") ORDER BY created_at ASC, id ASC",
        (limit,),
    )


def count_by_role(role: str) -> int:
    """某角色的调用次数。"""
    rows = _query(
        f"SELECT COUNT(*) AS n FROM {table.TABLE} WHERE role = ?", (role,)
    )
    return rows[0]["n"] if rows else 0


def _query(sql: str, params: tuple) -> list[CallLogRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
