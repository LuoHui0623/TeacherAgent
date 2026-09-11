"""SQLite 连接管理与迁移执行器。

- 数据库文件：`config.paths.DB_PATH`（WAL 模式）。
- 迁移：按文件名顺序执行 `scripts/*.sql`，幂等（`_migrations` 表记录已执行脚本名）。
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from importlib import resources

from teacheragent.config.paths import DB_PATH


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _load_scripts() -> list[tuple[str, str]]:
    """按文件名顺序加载 scripts/ 下所有 .sql，返回 [(文件名, 内容)]。"""
    pkg = resources.files("teacheragent.store.sqlite").joinpath("scripts")
    return sorted(
        ((f.name, f.read_text(encoding="utf-8")) for f in pkg.iterdir() if f.name.endswith(".sql")),
        key=lambda x: x[0],
    )


def migrate() -> None:
    """幂等执行所有迁移脚本。"""
    conn = _connect()
    try:
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
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_connection() as conn:
        return [dict(row) for row in conn.execute(sql, params)]


def execute(sql: str, params: tuple = ()) -> int:
    """执行写操作，返回 lastrowid。"""
    with get_connection() as conn:
        cur = conn.execute(sql, params)
        return cur.lastrowid or 0
