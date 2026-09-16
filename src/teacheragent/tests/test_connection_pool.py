"""SQLite 连接池契约：按线程隔离并在用例后归还，避免事务残留。"""

from concurrent.futures import ThreadPoolExecutor

from teacheragent.infrastructure.store.connection import _thread_pool, close_sqlite_pool, connection


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
