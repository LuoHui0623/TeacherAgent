"""教材生命周期状态契约。"""

from enum import StrEnum


class TextbookStatus(StrEnum):
    """教材生命周期状态。"""

    DRAFT = "draft"
    GENERATING = "generating"
    READY = "ready"
    ARCHIVED = "archived"
