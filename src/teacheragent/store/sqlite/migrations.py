"""SQLite 迁移执行器：按文件名顺序执行 `scripts/*.sql`，幂等。"""

from importlib import resources
from importlib.abc import Traversable

from teacheragent.store.connection import connection


def migrate() -> None:
    """执行所有未应用的迁移脚本。"""
    with connection() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _migrations ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT (datetime('now')))"
        )
        done = {row[0] for row in conn.execute("SELECT name FROM _migrations")}
        for name, sql in _load_scripts():
            if name in done:
                continue
            conn.executescript(sql)
            conn.execute("INSERT INTO _migrations (name) VALUES (?)", (name,))


def table_names() -> set[str]:
    """当前数据库中的表名。"""
    rows = _introspect("SELECT name FROM sqlite_master WHERE type = 'table'")
    return {row["name"] for row in rows}


def table_columns(table: str) -> tuple[str, ...]:
    """某张表的列名，顺序与 DDL 一致。"""
    rows = _introspect(f"PRAGMA table_info({table})")
    return tuple(row["name"] for row in rows)


def index_names() -> set[str]:
    """当前数据库中的索引名。"""
    rows = _introspect("SELECT name FROM sqlite_master WHERE type = 'index'")
    return {row["name"] for row in rows}


def applied_names() -> set[str]:
    """已应用的迁移脚本名。"""
    rows = _introspect("SELECT name FROM _migrations")
    return {row["name"] for row in rows}


def journal_mode() -> str:
    """当前数据库的日志模式。"""
    rows = _introspect("PRAGMA journal_mode")
    return rows[0]["journal_mode"].lower()


def _load_scripts() -> list[tuple[str, str]]:
    """按文件名顺序加载 `scripts/` 下所有 `.sql`。"""
    scripts: Traversable = resources.files("teacheragent.store.sqlite").joinpath("scripts")
    return sorted(
        (
            (script.name, script.read_text(encoding="utf-8"))
            for script in scripts.iterdir()
            if script.name.endswith(".sql")
        ),
        key=lambda item: item[0],
    )


def _introspect(sql: str) -> list[dict]:
    """读取数据库元数据；SQL 只保留在 store 内。"""
    with connection() as conn:
        return [dict(row) for row in conn.execute(sql)]
