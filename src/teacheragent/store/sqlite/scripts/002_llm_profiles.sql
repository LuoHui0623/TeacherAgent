-- llm_profiles：按角色隔离的 LLM Profile 与当前激活状态。
-- profile_id 即用户可见的 Profile name，同一角色内唯一。

CREATE TABLE IF NOT EXISTS llm_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
    valid INTEGER NOT NULL DEFAULT 1 CHECK (valid IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (role, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_llm_profiles_role ON llm_profiles(role, profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_profiles_active ON llm_profiles(role) WHERE active = 1;
