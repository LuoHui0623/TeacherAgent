-- call_logs is an LLM call audit table; prompt assets are not persisted here.
-- Rebuild the table so this migration works both for databases created from the
-- old schema and for fresh databases created from the current init.sql.

CREATE TABLE call_logs_without_prompt_ref (
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

INSERT INTO call_logs_without_prompt_ref (
    id, role, provider, model, input_text, output_text,
    prompt_tokens, completion_tokens, total_tokens, duration_ms,
    status, error, created_at
)
SELECT
    id, role, provider, model, input_text, output_text,
    prompt_tokens, completion_tokens, total_tokens, duration_ms,
    status, error, created_at
FROM call_logs;

DROP TABLE call_logs;
ALTER TABLE call_logs_without_prompt_ref RENAME TO call_logs;
CREATE INDEX IF NOT EXISTS idx_call_logs_role ON call_logs(role, created_at);
