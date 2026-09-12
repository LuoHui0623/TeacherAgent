"""LLM 原子能力：读配置、建客户端、日志落库后调用。"""

import json
from typing import Any

from teacheragent.capabilities.llm.call_logger import log_llm_call
from teacheragent.capabilities.llm.settings import get_settings
from teacheragent.constants import AgentRole
from teacheragent.shared import llm_client


def invoke_llm(
    role: AgentRole | str,
    messages: list[dict[str, str]],
    prompt_ref: str | None = None,
) -> Any:
    """带日志落库的同步 LLM 调用。"""
    settings = get_settings(role)
    input_text = json.dumps(messages, ensure_ascii=False)
    with log_llm_call(settings, input_text, prompt_ref) as record:
        client = llm_client.build_client(settings)
        response = client.invoke(messages)
        record.output_text = str(response.content)
        record.usage = llm_client.extract_usage(response)
        return response
