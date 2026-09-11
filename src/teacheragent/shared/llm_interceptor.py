"""LLM 调用拦截器：统一入口，自动落库，业务代码零侵入。

用法：
    from teacheragent.shared import invoke_llm

    resp = invoke_llm("teacher", [{"role": "user", "content": "你好"}])

每次调用现读 settings（热更新零成本），调用后写 call_logs（含异常）。
"""

import json
import time
from typing import Any

from langchain.chat_models import init_chat_model

from teacheragent.config import llm_settings
from teacheragent.store import execute
from teacheragent.store.sqlite.schemas import call_logs as call_logs_schema


def _build_client(settings: dict) -> Any:
    """按当前配置实例化 LangChain 客户端（每次调用现建，热更新天然成立）。"""
    return init_chat_model(
        settings["model"],
        model_provider=settings["provider"],
        api_key=llm_settings.get_api_key(settings["provider"]),
        base_url=llm_settings.get_base_url(),
        temperature=settings["temperature"],
    )


def _write_log(
    settings: dict,
    input_text: str,
    output_text: str,
    duration_ms: int,
    status: str,
    error: str,
    prompt_version_id: int | None,
    usage: dict,
) -> int:
    return execute(
        f"INSERT INTO {call_logs_schema.TABLE} "
        "(role, provider, model, prompt_version_id, input_text, output_text, "
        "prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            settings["role"], settings["provider"], settings["model"],
            prompt_version_id, input_text, output_text,
            usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0),
            usage.get("total_tokens", 0), duration_ms, status, error,
        ),
    )


def _extract_usage(resp: Any) -> dict:
    meta = getattr(resp, "usage_metadata", None) or {}
    return {
        "prompt_tokens": meta.get("input_tokens", 0),
        "completion_tokens": meta.get("output_tokens", 0),
        "total_tokens": meta.get("total_tokens", 0),
    }


def invoke_llm(
    role: str,
    messages: list[dict[str, str]],
    prompt_version_id: int | None = None,
) -> Any:
    """带日志落库的 LLM 调用。异常也落库后 re-raise。"""
    settings = llm_settings.get_settings(role)
    input_text = json.dumps(messages, ensure_ascii=False)
    start = time.perf_counter()
    try:
        client = _build_client(settings)
        resp = client.invoke(messages)
        duration_ms = int((time.perf_counter() - start) * 1000)
        _write_log(
            settings, input_text, str(resp.content), duration_ms, "ok", "",
            prompt_version_id, _extract_usage(resp),
        )
        return resp
    except Exception as e:
        duration_ms = int((time.perf_counter() - start) * 1000)
        _write_log(
            settings, input_text, "", duration_ms, "error", str(e),
            prompt_version_id, {},
        )
        raise
