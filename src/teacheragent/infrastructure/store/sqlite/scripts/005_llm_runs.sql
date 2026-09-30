CREATE TABLE IF NOT EXISTS llm_runs (
    run_id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    query_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    attempt INTEGER NOT NULL,
    role TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL NOT NULL,
    prompt_sources_json TEXT NOT NULL,
    input_messages_json TEXT NOT NULL,
    tools_json TEXT NOT NULL DEFAULT '[]',
    output_message_json TEXT NOT NULL DEFAULT '{}',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    status_code INTEGER,
    error TEXT NOT NULL DEFAULT '',
    UNIQUE(query_id, sequence, attempt)
);
CREATE INDEX IF NOT EXISTS idx_llm_runs_task ON llm_runs(task_id, started_at);
CREATE INDEX IF NOT EXISTS idx_llm_runs_query ON llm_runs(query_id, sequence, attempt);
CREATE INDEX IF NOT EXISTS idx_llm_runs_role_model ON llm_runs(role, model, started_at);