"""迁移执行器契约：建表完整、幂等、索引就位、提示词历史只以快照入库。"""

from teacheragent.infrastructure.store.sqlite import migrations

EXPECTED_TABLES = {
    "llm_settings",
    "llm_runs",
    "textbooks",
    "user_profiles",
    "user_interaction",
    "workflow_snapshots",
    "prompt_snapshots",
    "node_runs",
    "node_artifacts",
    "chat_messages",
}


def test_migrate_creates_all_tables():
    assert EXPECTED_TABLES <= migrations.table_names()


def test_migrate_creates_indexes():
    assert {
        "idx_user_interaction_user",
        "idx_user_profiles_user",
        "idx_node_runs_run",
        "idx_node_runs_status",
        "idx_node_artifacts_node",
        "idx_chat_messages_time",
    } <= migrations.index_names()


def test_behavior_logs_is_renamed_to_user_interaction():
    """改名后旧表与旧索引都不再存在，避免两套名字并存。"""
    assert "user_interaction" in migrations.table_names()
    assert "behavior_logs" not in migrations.table_names()
    assert "idx_behavior_user" not in migrations.index_names()


def test_migrate_is_idempotent():
    migrations.migrate()
    migrations.migrate()
    assert migrations.applied_names() == set(migrations.applied_names())


def test_journal_mode_is_wal():
    assert migrations.journal_mode() == "wal"


def test_prompt_history_lives_in_snapshots_only():
    """提示词正文只以内容寻址的快照入库；不存在可变的「当前版本」表。"""
    names = migrations.table_names()
    assert "prompt_snapshots" in names
    assert "prompt_versions" not in names
