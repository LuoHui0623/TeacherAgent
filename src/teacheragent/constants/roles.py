"""Agent 角色名契约。"""

from enum import StrEnum


class AgentRole(StrEnum):
    """Agent 角色名。"""

    TEACHER = "teacher"
    CURRICULUM = "curriculum"
    KNOWLEDGE_MAP = "knowledge_map"
