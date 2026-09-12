"""测试夹具：每个用例使用独立临时数据库，避免污染 `data/`。"""

import pytest

from teacheragent.config import paths
from teacheragent.store.connection import close_sqlite_pool
from teacheragent.store.sqlite import migrations


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """把数据库指向临时文件并完成迁移。"""
    close_sqlite_pool()
    monkeypatch.setattr(paths, "DB_PATH", tmp_path / "test.db")
    migrations.migrate()
