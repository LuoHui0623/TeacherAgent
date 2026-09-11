"""迁移执行器契约：建表完整、幂等、索引就位。"""

from teacheragent.store.sqlite import database

EXPECTED_TABLES = {
    "llm_settings",
    "prompt_versions",
    "call_logs",
    "textbooks",
    "user_profiles",
    "behavior_logs",
}


def _names(kind: str) -> set[str]:
    rows = database.query("SELECT name FROM sqlite_master WHERE type = ?", (kind,))
    return {row["name"] for row in rows}


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
