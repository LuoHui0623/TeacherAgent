"""prompt_versions 表契约：角色提示词版本化存储。"""

from typing import TypedDict

TABLE = "prompt_versions"

COLUMNS = ("id", "role", "version", "content", "created_at")


class PromptVersion(TypedDict):
    """prompt_versions 行。"""

    id: int
    role: str
    version: int
    content: str
    created_at: str
