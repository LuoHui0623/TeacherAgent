"""对话消息的词表：对话方、消息类别与 run 的发起类型。

`role` 是对话方，`type` 区分这条消息的类别：`chat` 是普通对话，`proposal` 是发起
一次教材生产的提议 —— run 只能由 proposal 发起（口径 1）。词表封闭，写接口只接受
这里的取值，因此库里的取值集合可枚举。
"""

USER_ROLE = "user"
"""用户发言。"""

ASSISTANT_ROLE = "assistant"
"""模型方发言。"""

ROLES = (USER_ROLE, ASSISTANT_ROLE)
"""允许写入的对话方。"""

CHAT_TYPE = "chat"
"""普通对话消息。"""

PROPOSAL_TYPE = "proposal"
"""发起一次教材生产的提议。"""

MESSAGE_TYPES = (CHAT_TYPE, PROPOSAL_TYPE)
"""允许写入的消息类别。"""

__all__ = [
    "ASSISTANT_ROLE",
    "CHAT_TYPE",
    "MESSAGE_TYPES",
    "PROPOSAL_TYPE",
    "ROLES",
    "USER_ROLE",
]
