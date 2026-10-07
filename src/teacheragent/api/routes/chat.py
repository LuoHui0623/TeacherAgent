"""对话接口：读消息、写消息、走一轮 Tutor 对话。

读与写是同一份事实的两端：消息只追加，顺序由 `event_time` 决定，所以这里不再维护
任何会话头或未读状态。写接口的 `type` 只接受词表里的取值，`proposal` 是发起运行的那种
（发起入口在 `/workflows/{workflow_id}/runs`）。
"""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from teacheragent.constants import CHAT_TYPE
from teacheragent.infrastructure.llm import client
from teacheragent.infrastructure.store.sqlite.tables.chat_messages import ChatMessageRow
from teacheragent.services import chat


router = APIRouter(prefix="/chat", tags=["chat"])

MessageRole = Literal["user", "assistant"]
MessageType = Literal["chat", "proposal"]


class MessageWriteRequest(BaseModel):
    """写入一条对话消息。"""

    role: MessageRole
    content: str = Field(min_length=1)
    type: MessageType = CHAT_TYPE


class TurnRequest(BaseModel):
    """走一轮 Tutor 对话：只给这一轮的用户发言，历史由后端从库里取。"""

    content: str = Field(min_length=1)


def _payload(row: ChatMessageRow) -> dict[str, Any]:
    """一条消息的响应形状。"""
    return {
        "messageId": row["message_id"],
        "role": row["role"],
        "type": row["type"],
        "content": row["content"],
        "eventTime": row["event_time"],
    }


@router.get("/messages")
def list_messages(limit: int = Query(default=chat.HISTORY_LIMIT, ge=1, le=500)) -> dict[str, Any]:
    """按时间升序列出对话消息（最早的一条在最前）。"""
    return {"messages": [_payload(row) for row in chat.list_messages(limit=limit)]}


@router.post("/messages", status_code=201)
def write_message(request: MessageWriteRequest) -> dict[str, Any]:
    """追加一条对话消息并返回它。"""
    try:
        row = chat.append_message(
            role=request.role,
            type=request.type,
            content=request.content,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return _payload(row)


@router.post("/turns", status_code=201)
def run_turn(request: TurnRequest) -> dict[str, Any]:
    """走一轮 Tutor 对话：用户消息与回复都落库，模型输入取整段对话。

    模型调用失败时返回 502，已经写下的用户消息保留 —— 重试就是再发生一轮。
    """
    try:
        turn = chat.tutor_turn(content=request.content)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=client.describe_error(error)) from error
    return {"user": _payload(turn.user), "assistant": _payload(turn.assistant)}
