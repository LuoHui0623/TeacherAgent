"""LLM 能力的公共输入、请求和运行记录契约。"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


def _content_of(message: dict[str, Any]) -> str | None:
    content = message.get("content")
    return content if isinstance(content, str) else None


class PromptSource(BaseModel):
    """一次 LlmMessages 使用的提示词资产来源。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    ref: str = Field(min_length=1)
    content_hash: str = Field(min_length=1)
    name: str | None = None
    order: int = Field(default=0, ge=0)
    role: str = Field(default="system", min_length=1)
    template_text: str = ""
    rendered_text: str = ""


class LlmMessages(BaseModel):
    """一次 LLM 调用的消息来源、注入内容与最终输入。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    sources: list[PromptSource]
    template_text: str
    injected_context: dict[str, Any] | None = None
    messages: list[dict[str, Any]]
    tools: list[dict[str, Any]] | None = None

    @property
    def system_prompt(self) -> str | None:
        for message in self.messages:
            if message.get("role") == "system":
                return _content_of(message)
        return None

    @property
    def user_prompt(self) -> str | None:
        for message in reversed(self.messages):
            if message.get("role") == "user":
                return _content_of(message)
        return None


@dataclass(frozen=True, slots=True)
class LlmRequestContext:
    """一次真实 provider 请求的不可变上下文。"""

    task_id: UUID
    query_id: UUID
    run_id: UUID
    sequence: int
    attempt: int
    llm_messages: LlmMessages


@dataclass(frozen=True, slots=True)
class WorkflowCallOrigin:
    """一次调用属于图上的哪个节点实例；非 workflow 调用不传。

    `bindings` 是这次调用读到的产物版本（`{输入端口: [{node_id, port_id, item_key,
    content_hash}]}`），有了它才能回答「这份产物基于哪一版输入」。
    """

    # 节点实例
    workflow_id: str
    workflow_run_id: str
    node_id: str
    generation: int = 0
    item_key: str = ""

    # 这次用到的提示词
    prompt_ref: str | None = None
    prompt_content_hash: str | None = None

    # 这次读到的产物版本
    bindings: Mapping[str, list[dict[str, str]]] = field(default_factory=dict)


class RunContext(BaseModel):
    """注入 LlmModel 的调用链元数据和提示词追踪数据。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    llm_messages: LlmMessages
    invocation_id: str = Field(min_length=1)
    sequence: int = Field(ge=1)


class LlmConfig(BaseModel):
    """一次调用实际使用的业务配置。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    model: str = Field(min_length=1)
    temperature: float


class LlmRun(BaseModel):
    """一次实际 LLM 请求的身份、提示词和运行结果。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    client_id: str = Field(default="runtime", min_length=1)
    llm_config: LlmConfig
    run_id: UUID = Field(default_factory=uuid4)
    task_id: UUID = Field(default_factory=uuid4)
    query_id: UUID = Field(default_factory=uuid4)
    invocation_id: str = Field(min_length=1)
    sequence: int = Field(ge=1)
    attempt: int = Field(default=1, ge=1)
    role: str = Field(min_length=1)

    llm_messages: LlmMessages
    output_message: dict[str, object] | None = None

    token_usage: dict[str, int] = Field(default_factory=dict)
    status: Literal["running", "success", "error"]
    status_code: int | None = None
    error: str | None = None
    started_at: str
    completed_at: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)

__all__ = [
    "LlmConfig",
    "LlmMessages",
    "LlmRequestContext",
    "LlmRun",
    "PromptSource",
    "RunContext",
    "WorkflowCallOrigin",
]
