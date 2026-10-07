"""通用常量与枚举（仅汇总导出，定义在各子模块）。"""

from .chat import ASSISTANT_ROLE, CHAT_TYPE, MESSAGE_TYPES, PROPOSAL_TYPE, ROLES, USER_ROLE
from .roles import AgentRole
from .textbook import TextbookStatus

__all__ = [
    "ASSISTANT_ROLE",
    "AgentRole",
    "CHAT_TYPE",
    "MESSAGE_TYPES",
    "PROPOSAL_TYPE",
    "ROLES",
    "USER_ROLE",
    "TextbookStatus",
]
