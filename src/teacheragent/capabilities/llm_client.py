"""LLM 客户端能力：按配置实例化客户端、归一 token 用量。"""

from typing import Any

from langchain.chat_models import init_chat_model

from teacheragent.config import env


def build_client(settings: dict) -> Any:
    """按当前配置实例化 LangChain 客户端。

    每次调用现建，因此配置变更即刻生效（热更新零成本）。
    """
    return init_chat_model(
        settings["model"],
        model_provider=settings["provider"],
        api_key=env.get_api_key(),
        base_url=env.get_base_url() or None,
        temperature=settings["temperature"],
    )


def extract_usage(response: Any) -> dict:
    """归一 token 用量；provider 未提供某字段时补 0。"""
    meta = getattr(response, "usage_metadata", None) or {}
    return {
        "prompt_tokens": meta.get("input_tokens", 0),
        "completion_tokens": meta.get("output_tokens", 0),
        "total_tokens": meta.get("total_tokens", 0),
    }
