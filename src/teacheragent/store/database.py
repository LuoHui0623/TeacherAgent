"""SQLite 存储层：连接管理 + schema 迁移。

设计要点：
- 单文件数据库（默认 data/teacheragent.db），WAL 模式。
- 启动时自动执行迁移（幂等）。
- 提供 get_connection() 上下文管理器，行以 dict 返回。
"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[3] / "data" / "teacheragent.db"

MIGRATIONS: list[str] = [
    # 1: 初始 schema
    """
    CREATE TABLE IF NOT EXISTS llm_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        api_key TEXT NOT NULL DEFAULT '',
        base_url TEXT NOT NULL DEFAULT '',
        temperature REAL NOT NULL DEFAULT 0.7,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(role, version)
    );

    CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version_id INTEGER,
        input_text TEXT NOT NULL,
        output_text TEXT NOT NULL DEFAULT '',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ok',
        error TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_call_logs_role ON call_logs(role, created_at);

    CREATE TABLE IF NOT EXISTS textbooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        content TEXT NOT NULL DEFAULT '',
        call_log_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT NOT NULL UNIQUE,
        summary TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS behavior_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_logs(user_key, created_at);
    """,
]


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def migrate() -> None:
    """幂等执行所有迁移。"""
    conn = _connect()
    try:
        applied = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
            )
        }
        if not applied:
            conn.execute("CREATE TABLE _migrations (id INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))")
        done = {row[0] for row in conn.execute("SELECT id FROM _migrations")}
        for i, sql in enumerate(MIGRATIONS, start=1):
            if i in done:
                continue
            conn.executescript(sql)
            conn.execute("INSERT INTO _migrations (id) VALUES (?)", (i,))
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
