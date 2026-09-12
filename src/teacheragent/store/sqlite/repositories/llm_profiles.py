"""llm_profiles 仓储：按角色隔离的 Profile 持久化与激活状态。"""

from teacheragent.store.connection import connection
from teacheragent.store.sqlite.tables import llm_profiles as table
from teacheragent.store.sqlite.tables.llm_profiles import LlmProfileRow


def list_profiles(role: str) -> list[LlmProfileRow]:
    """按激活态优先、名称次序列出某角色 Profile。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE role = ? ORDER BY active DESC, profile_id",
        (role,),
    )
    return rows


def get_profile(role: str, profile_id: str) -> LlmProfileRow | None:
    """按角色和 Profile name 精确读取。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE role = ? AND profile_id = ?",
        (role, profile_id),
    )
    return rows[0] if rows else None


def get_active(role: str) -> LlmProfileRow | None:
    """读取某角色当前激活 Profile。"""
    rows = _query(
        f"SELECT * FROM {table.TABLE} WHERE role = ? AND active = 1",
        (role,),
    )
    return rows[0] if rows else None


def _query(sql: str, params: tuple = ()) -> list[LlmProfileRow]:
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]


def upsert_profile(
    role: str,
    profile_id: str,
    *,
    model: str,
    temperature: float,
) -> LlmProfileRow:
    """创建或更新 Profile；更新不改变激活态。"""
    with connection() as conn:
        conn.execute(
            f"INSERT INTO {table.TABLE} "
            "(role, profile_id, model, temperature) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(role, profile_id) DO UPDATE SET "
            "model = excluded.model, temperature = excluded.temperature, "
            "updated_at = datetime('now')",
            (role, profile_id, model, temperature),
        )
    row = get_profile(role, profile_id)
    if row is None:
        raise RuntimeError(f"Profile 写入失败：{profile_id}")
    return row


def activate_profile(role: str, profile_id: str) -> LlmProfileRow:
    """切换某角色激活 Profile；操作在单事务内完成。"""
    with connection() as conn:
        conn.execute("BEGIN")
        conn.execute(
            f"UPDATE {table.TABLE} SET active = 0, updated_at = datetime('now') "
            "WHERE role = ? AND active = 1",
            (role,),
        )
        cursor = conn.execute(
            f"UPDATE {table.TABLE} SET active = 1, updated_at = datetime('now') "
            "WHERE role = ? AND profile_id = ?",
            (role, profile_id),
        )
        if cursor.rowcount != 1:
            raise LookupError(f"Profile 不存在：{profile_id}")
    row = get_profile(role, profile_id)
    if row is None:
        raise LookupError(f"Profile 不存在：{profile_id}")
    return row


def delete_profile(role: str, profile_id: str) -> None:
    """删除非激活 Profile；激活 Profile 不允许删除。"""
    current = get_active(role)
    if current and current["profile_id"] == profile_id:
        raise ValueError("激活 Profile 不可删除")
    with connection() as conn:
        cursor = conn.execute(
            f"DELETE FROM {table.TABLE} WHERE role = ? AND profile_id = ?",
            (role, profile_id),
        )
        if cursor.rowcount != 1:
            raise LookupError(f"Profile 不存在：{profile_id}")


def sync_model_catalog(models: tuple[str, ...]) -> dict:
    """按最新目录刷新 Profile 有效态；激活项失效时自动切换。"""
    with connection() as conn:
        conn.execute("BEGIN")
        if not models:
            conn.execute(
                f"UPDATE {table.TABLE} SET valid = 0, updated_at = datetime('now')"
            )
        else:
            placeholders = ",".join("?" for _ in models)
            conn.execute(
                f"UPDATE {table.TABLE} SET valid = 0, updated_at = datetime('now') "
                f"WHERE model NOT IN ({placeholders})",
                models,
            )
            conn.execute(
                f"UPDATE {table.TABLE} SET valid = 1, updated_at = datetime('now') "
                f"WHERE model IN ({placeholders})",
                models,
            )
        invalid_actives = conn.execute(
            f"SELECT role, profile_id FROM {table.TABLE} "
            "WHERE active = 1 AND valid = 0"
        ).fetchall()
        for row in invalid_actives:
            role = row["role"]
            conn.execute(
                f"UPDATE {table.TABLE} SET active = 0, updated_at = datetime('now') "
                "WHERE role = ? AND active = 1",
                (role,),
            )
            next_profile = conn.execute(
                f"SELECT profile_id FROM {table.TABLE} "
                "WHERE role = ? AND valid = 1 ORDER BY profile_id LIMIT 1",
                (role,),
            ).fetchone()
            if next_profile:
                conn.execute(
                    f"UPDATE {table.TABLE} SET active = 1, updated_at = datetime('now') "
                    "WHERE role = ? AND profile_id = ?",
                    (role, next_profile["profile_id"]),
                )
    affected = _query(
        f"SELECT * FROM {table.TABLE} WHERE active = 1 OR valid = 0"
    )
    return {
        "invalid_profiles": [row["profile_id"] for row in affected if not row["valid"]],
        "recovered_profiles": [row["profile_id"] for row in affected if row["valid"]],
    }
