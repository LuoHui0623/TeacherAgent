-- 007_workflow_runs.sql：workflow 运行落库
--
-- 按用途分三类，全部只追加、不覆盖、不删除（重跑以 generation 追加新代次）：
--   资产记录表：workflow_snapshots / prompt_snapshots / node_artifacts
--   运行表：node_runs
--   对话：chat_messages
--
-- 时间列由仓储写入 ISO8601 UTC 字符串，不用 DEFAULT (datetime('now'))：格式统一才能按字符串排序，
-- 也才能让调用方显式给出可复现的时间。运行期产生的行用 `event_time`（该行事实发生的时刻）：
-- `node_runs` / `node_artifacts` / `chat_messages`；跨运行的资产库用 `add_time`（该版本被追加的时间）：
-- `workflow_snapshots` / `prompt_snapshots`。
-- 节点状态取值由 workflows 层的状态词表给出，DDL 只约束类型。

CREATE TABLE IF NOT EXISTS workflow_snapshots (
    workflow_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    add_time TEXT NOT NULL,
    PRIMARY KEY (workflow_id, content_hash)
);

CREATE TABLE IF NOT EXISTS prompt_snapshots (
    ref TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    content TEXT NOT NULL,
    add_time TEXT NOT NULL,
    PRIMARY KEY (ref, content_hash)
);

CREATE TABLE IF NOT EXISTS node_runs (
    workflow_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    item_key TEXT NOT NULL DEFAULT '',
    generation INTEGER NOT NULL DEFAULT 0,
    workflow_content_hash TEXT NOT NULL,
    trigger_message_id TEXT,
    status TEXT NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    event_time TEXT NOT NULL,
    error TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (workflow_id, run_id, node_id, item_key, generation)
);
CREATE INDEX IF NOT EXISTS idx_node_runs_run ON node_runs(workflow_id, run_id, event_time);
CREATE INDEX IF NOT EXISTS idx_node_runs_status ON node_runs(status, event_time);

CREATE TABLE IF NOT EXISTS node_artifacts (
    workflow_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    item_key TEXT NOT NULL DEFAULT '',
    port_id TEXT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    event_time TEXT NOT NULL,
    PRIMARY KEY (workflow_id, run_id, node_id, item_key, port_id, generation)
);
CREATE INDEX IF NOT EXISTS idx_node_artifacts_node
    ON node_artifacts(workflow_id, run_id, node_id, generation);

CREATE TABLE IF NOT EXISTS chat_messages (
    message_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    event_time TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_time ON chat_messages(event_time);

-- behavior_logs 更名为 user_interaction：职责与写入点待定义，定义前不允许任何代码写入。
-- RENAME 不改索引名，因此旧索引显式删除后按新表名重建。
ALTER TABLE behavior_logs RENAME TO user_interaction;
DROP INDEX IF EXISTS idx_behavior_user;
CREATE INDEX IF NOT EXISTS idx_user_interaction_user ON user_interaction(user_key, created_at);
