"""llm_settings 仓储：每角色有效配置的持久化。"""

from teacheragent.infrastructure.store.connection import connection
from teacheragent.infrastructure.store.sqlite.tables import llm_settings as table
from teacheragent.infrastructure.store.sqlite.tables.llm_settings import LlmSettingsRow


def get_override(role: str) -> LlmSettingsRow | None:
    """读取某角色的覆盖值；不存在时返回 None。"""
    rows = _query(f"SELECT * FROM {table.TABLE} WHERE role = ?", (role,))
    return rows[0] if rows else None


def save_override(
    role: str,
    *,
    provider: str,
    model: str,
    temperature: float,
) -> LlmSettingsRow:
    """写入覆盖值并返回存储后的行。"""
    with connection() as conn:
        conn.execute(
        f"INSERT INTO {table.TABLE} (role, provider, model, temperature) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(role) DO UPDATE SET provider = excluded.provider, model = excluded.model, "
        "temperature = excluded.temperature, updated_at = datetime('now')",
            (role, provider, model, temperature),
        )
    rows = _query(f"SELECT * FROM {table.TABLE} WHERE role = ?", (role,))
    return rows[0]


def _query(sql: str, params: tuple) -> list[LlmSettingsRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]
