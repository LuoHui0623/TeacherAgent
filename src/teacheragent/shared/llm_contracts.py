"""跨层共享的 LLM 输入、请求和运行记录契约。"""

from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


def _content_of(message: dict[str, Any]) -> str | None:
    content = message.get("content")
    return content if isinstance(content, str) else None


class PromptSource(BaseModel):
    """一次 PromptTrace 使用的提示词资产来源。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    ref: str = Field(min_length=1)
    content_hash: str = Field(min_length=1)
    name: str | None = None
    order: int = Field(default=0, ge=0)
    role: str = Field(default="system", min_length=1)
    template_text: str = ""
    rendered_text: str = ""


class PromptTrace(BaseModel):
    """一次调用的 prompt 来源、注入内容与最终模型输入。"""

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
    prompt_trace: PromptTrace


class RunContext(BaseModel):
    """注入 ChatModel 的调用链元数据和提示词追踪数据。"""

    model_config = ConfigDict(extra="forbid", strict=True)

    prompt_trace: PromptTrace
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
    prompt_trace: PromptTrace
    output_message: dict[str, object] | None = None
    token_usage: dict[str, int] = Field(default_factory=dict)
    status: Literal["running", "success", "error"]
    status_code: int | None = None
    error: str | None = None
    started_at: str
    completed_at: str | None = None
    duration_ms: int | None = Field(default=None, ge=0)
