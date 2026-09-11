"""测试夹具：每个用例使用独立临时数据库，避免污染 `data/`。"""

import pytest

from teacheragent.store.sqlite import database


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """把数据库指向临时文件并完成迁移。"""
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "test.db")
    database.migrate()
