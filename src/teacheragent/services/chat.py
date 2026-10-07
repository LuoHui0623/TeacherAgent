"""对话：消息的追加与读取，以及一轮 Tutor 对话的编排。

对话是一串只追加的事实：每条消息一行 `chat_messages`，`role` 是对话方，`type` 区分
类别（`proposal` 是发起教材生产的提议）。`llm_runs` 只记每次模型调用的输入输出与用量，
不承载对话，所以「模型说了什么」只在这里。

一轮对话 = 写下这条用户消息 → 取回整段对话当模型输入 → 写下模型回复。模型调用失败时
已经写下的用户消息保留：那次发言确实发生了，缺的只是回复，重试就是再发生一轮（消息表
只追加，不做删除）。
"""

from dataclasses import dataclass
from datetime import datetime

from teacheragent.constants import ASSISTANT_ROLE, CHAT_TYPE, ROLES, USER_ROLE, AgentRole
from teacheragent.infrastructure.store.sqlite.repositories import chat_messages as message_repo
from teacheragent.infrastructure.store.sqlite.tables.chat_messages import ChatMessageRow
from teacheragent.services.llm import base_agent
from teacheragent.shared.sequence import next_sequence_id

MESSAGE_ID_PREFIX = "msg"
"""消息 id 前缀；编号在该序列内递增。"""

HISTORY_LIMIT = 200
"""一轮对话最多带多少条历史进模型。"""


@dataclass(frozen=True, slots=True)
class ChatTurn:
    """一轮对话的两条消息。"""

    user: ChatMessageRow
    assistant: ChatMessageRow


def append_message(
    *,
    role: str,
    type: str,
    content: str,
    at: datetime | None = None,
) -> ChatMessageRow:
    """追加一条对话消息并返回该行；编号在这里分配，消息只追加不覆盖。"""
    if role not in ROLES:
        raise ValueError(f"未知的对话方：{role}")
    text = content.strip()
    if not text:
        raise ValueError("对话内容不能为空")
    message_id = next_sequence_id(message_repo.list_message_ids(), MESSAGE_ID_PREFIX)
    return message_repo.add_message(
        message_id=message_id,
        role=role,
        type=type,
        content=text,
        at=at,
    )


def list_messages(*, limit: int = HISTORY_LIMIT) -> list[ChatMessageRow]:
    """按时间升序取最近 `limit` 条消息。"""
    return message_repo.list_messages(limit=limit)


def tutor_turn(*, content: str, at: datetime | None = None) -> ChatTurn:
    """走一轮 Tutor 对话：用户消息先落库，模型输入取整段对话，回复随后落库。"""
    history = _history()
    user = append_message(role=USER_ROLE, type=CHAT_TYPE, content=content, at=at)
    response = base_agent.BaseAgent(AgentRole.TUTOR).invoke(
        [*history, {"role": USER_ROLE, "content": user["content"]}]
    )
    assistant = append_message(
        role=ASSISTANT_ROLE,
        type=CHAT_TYPE,
        content=response.content,
        at=at,
    )
    return ChatTurn(user=user, assistant=assistant)


def _history() -> list[dict[str, str]]:
    """已落库的对话，形状就是模型要的 `role` / `content` 序列。"""
    return [
        {"role": row["role"], "content": row["content"]}
        for row in list_messages()
    ]
