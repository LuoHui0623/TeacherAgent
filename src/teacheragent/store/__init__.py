"""存储层唯一入口。

高层 API：

- ``migrate()`` / ``query()`` / ``execute()`` / ``get_connection()``
- ``repositories``：表级仓储（``llm_settings`` / ``call_logs``）
"""

from .sqlite import repositories
from .sqlite.database import execute, get_connection, migrate, query

__all__ = ["execute", "get_connection", "migrate", "query", "repositories"]
