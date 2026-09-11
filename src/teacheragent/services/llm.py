"""LLM 调用编排：读配置 → 建客户端 → 拦截器计时落库。

业务代码统一从此入口发起 LLM 调用，无需书写任何日志代码。
"""

import json
from typing import Any

from teacheragent.capabilities import llm_client
from teacheragent.constants import AgentRole
from teacheragent.shared import intercept
from teacheragent.store import repositories


def invoke_llm(
    role: AgentRole | str,
    messages: list[dict[str, str]],
    prompt_version_id: int | None = None,
) -> Any:
    """带日志落库的同步 LLM 调用。

    配置现读现用，因此模型与 temperature 的热更新在下一次调用即生效。
    """
    settings = repositories.llm_settings.get_settings(role)
    input_text = json.dumps(messages, ensure_ascii=False)
    with intercept(settings, input_text, prompt_version_id) as record:
        client = llm_client.build_client(settings)
        response = client.invoke(messages)
        record.output_text = str(response.content)
        record.usage = llm_client.extract_usage(response)
        return response
