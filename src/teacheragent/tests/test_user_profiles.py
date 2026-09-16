"""画像仓储契约：版本窗口、当前版本、无条件删除与恢复语义。"""

from datetime import UTC, datetime, timedelta

from teacheragent.infrastructure.store.sqlite.repositories import user_profiles as repo

BASE = datetime(2026, 9, 14, 12, 0, 0, tzinfo=UTC)


def _save(content: str, seconds: int = 0):
    return repo.save_version("admin", content, at=BASE + timedelta(seconds=seconds))


def test_no_version_before_first_save():
    assert repo.current() is None
    assert repo.list_versions() == []


def test_save_writes_version_with_id_and_hash():
    row = _save("# 画像 v1")
    assert row["id"] == "admin-20260914120000"
    assert row["user_key"] == "admin"
    assert row["content"] == "# 画像 v1"
    assert row["content_hash"].startswith("sha256:")
    assert row["created_at"]


def test_current_is_latest_version():
    _save("v1")
    _save("v2", seconds=1)
    assert repo.current()["content"] == "v2"


def test_window_keeps_current_plus_two_history():
    for index in range(4):
        _save(f"v{index}", seconds=index)
    versions = repo.list_versions()
    assert [row["content"] for row in versions] == ["v3", "v2", "v1"]


def test_prune_is_unconditional():
    """被引用的历史版本同样按窗口删除，不做例外。"""
    _save("v1")
    _save("v2", seconds=1)
    _save("v3", seconds=2)
    first_id = repo.build_version_id("admin", BASE)
    assert repo.get(first_id) is not None

    _save("v4", seconds=3)

    assert repo.get(first_id) is None
    assert repo.get(repo.build_version_id("admin", BASE + timedelta(seconds=1))) is not None


def test_restore_copies_old_content_as_new_version():
    first = _save("v1")
    _save("v2", seconds=1)

    restored = repo.save_version("admin", first["content"], at=BASE + timedelta(seconds=2))

    assert restored["id"] == "admin-20260914120002"
    assert restored["content"] == "v1"
    assert [row["content"] for row in repo.list_versions()] == ["v1", "v2", "v1"]


def test_versions_are_isolated_per_user():
    _save("admin 的画像")
    repo.save_version("guest", "guest 的画像", at=BASE)
    assert [row["content"] for row in repo.list_versions("admin")] == ["admin 的画像"]
    assert [row["content"] for row in repo.list_versions("guest")] == ["guest 的画像"]