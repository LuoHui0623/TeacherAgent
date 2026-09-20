"""Agent 角色名契约。"""

from enum import StrEnum


class AgentRole(StrEnum):
    """系统中可配置、可调用的两类 Agent。"""

    TUTOR = "tutor"
    CURRICULUM = "curriculum"
