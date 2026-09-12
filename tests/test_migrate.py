"""迁移执行器契约：建表完整、幂等、索引就位、提示词不入库。"""

from teacheragent.store.sqlite import database

EXPECTED_TABLES = {
    "llm_settings",
    "call_logs",
    "textbooks",
    "user_profiles",
    "behavior_logs",
}


def _names(kind: str) -> set[str]:
    rows = database.query("SELECT name FROM sqlite_master WHERE type = ?", (kind,))
    return {row["name"] for row in rows}


def _columns(table: str) -> set[str]:
    return {row["name"] for row in database.query(f"PRAGMA table_info({table})")}


def test_migrate_creates_all_tables():
    assert EXPECTED_TABLES <= _names("table")


def test_migrate_creates_indexes():
    assert {"idx_call_logs_role", "idx_behavior_user"} <= _names("index")


def test_migrate_is_idempotent():
    database.migrate()
    database.migrate()
    applied = [row["name"] for row in database.query("SELECT name FROM _migrations")]
    assert len(applied) == len(set(applied)), "同一脚本不得重复记录"


def test_journal_mode_is_wal():
    rows = database.query("PRAGMA journal_mode")
    assert rows[0]["journal_mode"].lower() == "wal"


def test_prompts_are_not_stored_in_sql():
    """提示词是 `prompts/*.md` 文件资产，由 git 版本化，不入库。"""
    assert "prompt_versions" not in _names("table")


def test_call_logs_references_prompt_by_path():
    columns = _columns("call_logs")
    assert "prompt_ref" in columns
    assert "prompt_version_id" not in columns
