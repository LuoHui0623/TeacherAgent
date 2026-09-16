"""LLM 配置合并：固化配置 + 表覆盖值 + 环境变量。"""

from teacheragent.infrastructure.llm import catalog
from teacheragent.config import llm
from teacheragent.config.llm import LlmSettings
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.store import repositories


def get_settings(role: AgentRole | str) -> LlmSettings:
    """读取某角色的有效配置；当前激活 Profile 优先，固化配置兜底。"""
    key = str(role)
    profile = repositories.llm_profiles.get_active(key)
    if profile and profile["valid"]:
        return {
            "role": key,
            "provider": catalog.model_provider(profile["model"]),
            "model": profile["model"],
            "temperature": profile["temperature"],
        }
    option = llm.role_default_option(key)
    return {
        "role": key,
        "provider": catalog.model_provider(option.model) or option.provider,
        "model": option.model,
        "temperature": llm.default_temperature(),
    }


def save_settings(
    role: AgentRole | str,
    *,
    model: str | None = None,
    temperature: float | None = None,
) -> LlmSettings:
    """保存某角色的运行时覆盖值，未传字段保持原值。"""
    current = get_settings(role)
    new_model = model or current["model"]
    option = llm.find_option(new_model)
    new_provider = option.provider if option else current["provider"]
    new_temperature = temperature if temperature is not None else current["temperature"]
    repositories.llm_settings.save_override(
        role=str(role),
        provider=new_provider,
        model=new_model,
        temperature=new_temperature,
    )
    return get_settings(role)
