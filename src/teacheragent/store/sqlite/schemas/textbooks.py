"""textbooks 表契约：教材资产。"""

from typing import TypedDict

TABLE = "textbooks"

COLUMNS = ("id", "title", "status", "content", "call_log_id", "created_at", "updated_at")


class Textbook(TypedDict):
    """textbooks 行。"""

    id: int
    title: str
    status: str
    content: str
    call_log_id: int | None
    created_at: str
    updated_at: str
