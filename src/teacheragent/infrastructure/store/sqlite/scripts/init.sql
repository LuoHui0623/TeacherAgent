-- init.sql：初始 schema
--
-- 本文件是表结构的唯一权威（DDL）。Python 侧的行契约见 ../tables/，
-- 二者由 tests/test_table_contracts.py 强制一致（列名与顺序）。
--
-- 迁移策略：首次发布前可直接修改本文件（配合删除 data/teacheragent.db 重建）；
-- 首次发布后一律新增脚本，不再改动已应用的脚本。

CREATE TABLE IF NOT EXISTS llm_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS call_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
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
    id TEXT PRIMARY KEY,
    user_key TEXT NOT NULL DEFAULT 'admin',
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_key, created_at);

CREATE TABLE IF NOT EXISTS behavior_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_behavior_user ON behavior_logs(user_key, created_at);
