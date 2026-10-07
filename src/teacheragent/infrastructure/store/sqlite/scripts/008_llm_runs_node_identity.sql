-- 008_llm_runs_node_identity.sql：让每次模型调用归属到图上的节点实例
--
-- 八列全部可空：非 workflow 调用（Tutor 对话）保持 NULL，旧行不受影响。
-- 列名用 `workflow_run_id` 而不是 `run_id`，因为 `llm_runs.run_id` 已经是这次 provider
-- 请求自己的 id，两者不是一回事。
-- 一个节点可能 0 次调用，也可能多次（重试、多轮），用
-- `(workflow_id, workflow_run_id, node_id, item_key, generation)` 归组。

ALTER TABLE llm_runs ADD COLUMN workflow_id TEXT;
ALTER TABLE llm_runs ADD COLUMN workflow_run_id TEXT;
ALTER TABLE llm_runs ADD COLUMN node_id TEXT;
ALTER TABLE llm_runs ADD COLUMN item_key TEXT;
ALTER TABLE llm_runs ADD COLUMN generation INTEGER;
ALTER TABLE llm_runs ADD COLUMN prompt_ref TEXT;
ALTER TABLE llm_runs ADD COLUMN prompt_content_hash TEXT;
ALTER TABLE llm_runs ADD COLUMN bindings_json TEXT;

CREATE INDEX IF NOT EXISTS idx_llm_runs_node
    ON llm_runs(workflow_id, workflow_run_id, node_id, generation);
