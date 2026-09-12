"""SQLite 连接池与 Neo4j 官方驱动池。"""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from queue import LifoQueue
import threading
from threading import Semaphore

from neo4j import GraphDatabase, Session

from teacheragent.config import env, paths


MAX_CONNECTIONS = 4
"""同时打开的 SQLite 连接上限。"""

_SLOTS = Semaphore(MAX_CONNECTIONS)
_THREAD_POOLS: dict[int, LifoQueue[sqlite3.Connection]] = {}
_THREAD_POOLS_LOCK = threading.Lock()

_DRIVER = None


def _open_sqlite_connection() -> sqlite3.Connection:
    path = paths.DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """借用 SQLite 连接；归还前回滚，避免事务残留。"""
    conn = _acquire_sqlite_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _release_sqlite_connection(conn)


@contextmanager
def neo4j_session() -> Iterator[Session]:
    """借用 Neo4j 会话；驱动自身维护连接池。"""
    global _DRIVER
    if _DRIVER is None:
        _DRIVER = GraphDatabase.driver(
            env.get_env("NEO4J_URI"),
            auth=(env.get_env("NEO4J_USER"), env.get_env("NEO4J_PASSWORD")),
        )
    session = _DRIVER.session()
    try:
        yield session
    finally:
        session.close()


def close_sqlite_pool() -> None:
    """关闭并清空所有线程池中的空闲连接。"""
    with _THREAD_POOLS_LOCK:
        pools = list(_THREAD_POOLS.values())
        _THREAD_POOLS.clear()
    for pool in pools:
        while True:
            try:
                pool.get_nowait().close()
            except Exception:
                break


def close_neo4j_driver() -> None:
    """关闭 Neo4j 驱动。"""
    global _DRIVER
    if _DRIVER is not None:
        _DRIVER.close()
        _DRIVER = None


def _acquire_sqlite_connection() -> sqlite3.Connection:
    """先占名额，再从当前线程池取连接；池空则新建。"""
    _SLOTS.acquire()
    try:
        return _thread_pool().get_nowait()
    except Exception:
        return _open_sqlite_connection()


def _release_sqlite_connection(conn: sqlite3.Connection) -> None:
    conn.rollback()
    _thread_pool().put(conn)
    _SLOTS.release()


def _thread_pool() -> LifoQueue[sqlite3.Connection]:
    """SQLite 连接不能跨线程使用，因此按线程保留各自队列。"""
    thread_id = threading.get_ident()
    with _THREAD_POOLS_LOCK:
        if thread_id not in _THREAD_POOLS:
            _THREAD_POOLS[thread_id] = LifoQueue(maxsize=MAX_CONNECTIONS)
        return _THREAD_POOLS[thread_id]
