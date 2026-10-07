"""SQLite 连接池契约：按线程隔离并在用例后归还，避免事务残留。"""

from concurrent.futures import ThreadPoolExecutor

import pytest

from teacheragent.infrastructure.store.connection import _thread_pool, close_sqlite_pool, connection
from teacheragent.infrastructure.store.sqlite import migrations


def test_connection_is_returned_to_pool():
    close_sqlite_pool()
    with connection():
        pass
    assert _thread_pool().qsize() == 1


def test_worker_thread_does_not_reuse_main_thread_connection():
    close_sqlite_pool()
    with connection():
        pass
    main_qsize = _thread_pool().qsize()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(lambda: _thread_pool().qsize())
        worker_qsize = future.result()

    assert main_qsize == 1
    assert worker_qsize == 0


def test_nested_connection_borrows_the_same_connection():
    """同一线程内嵌套借用复用同一个连接，只有最外层提交。"""
    close_sqlite_pool()

    with connection() as outer:
        with connection() as inner:
            assert inner is outer
            inner.execute("CREATE TABLE nested_probe (id INTEGER)")

    assert "nested_probe" in migrations.table_names()


def test_nested_failure_rolls_back_the_whole_transaction():
    """内层写入随最外层的失败一起回滚，不留半写。"""
    close_sqlite_pool()
    with connection() as conn:
        conn.execute("CREATE TABLE rollback_probe (id INTEGER)")

    with pytest.raises(RuntimeError):
        with connection() as conn:
            conn.execute("INSERT INTO rollback_probe (id) VALUES (1)")
            with connection() as inner:
                inner.execute("INSERT INTO rollback_probe (id) VALUES (2)")
            raise RuntimeError("中途失败")

    assert _count("rollback_probe") == 0


def _count(table: str) -> int:
    with connection() as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
