"""LLM 客户端构建与用量归一。"""

import re
import uuid
from typing import Any

from langchain.chat_models import init_chat_model

from teacheragent.config import env
from teacheragent.config.llm import LlmSettings


def build_client(settings: LlmSettings) -> Any:
    """按当前配置实例化 LangChain 客户端。

    `API_URL` 是 OpenAI 兼容网关，因此请求协议固定使用 OpenAI provider；
    `settings["provider"]` 只保留从 model id 解析出的模型族信息，用于日志。
    """
    return init_chat_model(
        settings["model"],
        model_provider="openai",
        api_key=env.get_api_key(),
        base_url=env.get_api_url() or None,
        temperature=settings["temperature"],
        default_headers={"x-opencode-session": _session_id()},
    )


def extract_usage(response: Any) -> dict:
    """归一 token 用量；provider 未提供某字段时补 0。"""
    meta = getattr(response, "usage_metadata", None) or {}
    return {
        "prompt_tokens": meta.get("input_tokens", 0),
        "completion_tokens": meta.get("output_tokens", 0),
        "total_tokens": meta.get("total_tokens", 0),
}


def describe_error(exc: Exception) -> dict:
    """把模型调用异常归一为可读错误，避免直接暴露密钥。"""
    message = _redact(str(exc) or exc.__class__.__name__)
    status_code = _status_code(exc)
    text = message.lower()

    if any(
        marker in text
        for marker in (
            "model not found",
            "invalid model",
            "unsupported model",
            "not supported",
        )
    ):
        return {"error_type": "model_unavailable", "message": message}
    if status_code in {401, 403} or any(
        marker in text for marker in ("401", "403", "unauthorized", "invalid api key")
    ):
        return {"error_type": "auth_failure", "message": message}
    if status_code == 404 or any(
        marker in text
        for marker in ("404", "model not found", "invalid model", "unsupported model")
    ):
        return {"error_type": "model_unavailable", "message": message}
    if any(
        marker in text
        for marker in (
            "connection",
            "timeout",
            "timed out",
            "unreachable",
            "ssl",
            "temporarily unavailable",
        )
    ):
        return {"error_type": "network_failure", "message": message}
    return {"error_type": "invocation_failure", "message": message}


def _status_code(exc: Exception) -> int | None:
    """从常见 HTTP 异常对象中读取状态码。"""
    code = getattr(exc, "status_code", None)
    if isinstance(code, int):
        return code
    response = getattr(exc, "response", None)
    response_code = getattr(response, "status_code", None)
    if isinstance(response_code, int):
        return response_code
    return None


def _redact(text: str) -> str:
    """遮挡常见密钥形态，避免日志或接口回显秘密。"""
    api_key = env.get_api_key()
    if api_key:
        text = text.replace(api_key, "***")
    return re.sub(r"sk-[A-Za-z0-9_.-]+", "sk-***", text)


def _session_id() -> str:
    """OpenCode 网关要求每次部署携带会话 ID，用于路由。"""
    return env.get_env("OPENCODE_SESSION_ID") or uuid.uuid4().hex
