"""迁移执行器契约：建表完整、幂等、索引就位、提示词不入库。"""

from teacheragent.infrastructure.store.sqlite import migrations

EXPECTED_TABLES = {
    "llm_settings",
    "call_logs",
    "textbooks",
    "user_profiles",
    "behavior_logs",
}


def test_migrate_creates_all_tables():
    assert EXPECTED_TABLES <= migrations.table_names()


def test_migrate_creates_indexes():
    assert {"idx_call_logs_role", "idx_behavior_user", "idx_user_profiles_user"} <= migrations.index_names()


def test_migrate_is_idempotent():
    migrations.migrate()
    migrations.migrate()
    assert migrations.applied_names() == set(migrations.applied_names())


def test_journal_mode_is_wal():
    assert migrations.journal_mode() == "wal"


def test_prompts_are_not_stored_in_sql():
    """提示词是能力域与 workflow 目录下的 `prompts/*.md` 文件资产，由 git 版本化，不入库。"""
    assert "prompt_versions" not in migrations.table_names()


def test_call_logs_does_not_store_prompt_reference():
    columns = migrations.table_columns("call_logs")
    assert "prompt_ref" not in columns
    assert "prompt_version_id" not in columns
