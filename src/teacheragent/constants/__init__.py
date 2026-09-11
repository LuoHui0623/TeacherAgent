"""通用常量与枚举。"""

from enum import StrEnum


class AgentRole(StrEnum):
    """Agent 角色名。"""

    TEACHER = "teacher"
    CURRICULUM = "curriculum"
    KNOWLEDGE_MAP = "knowledge_map"


class TextbookStatus(StrEnum):
    """教材生命周期状态。"""

    DRAFT = "draft"
    GENERATING = "generating"
    READY = "ready"
    ARCHIVED = "archived"
