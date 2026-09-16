"""Profile 服务编排：把能力层校验和存储封装为 API 可用接口。"""

from teacheragent.infrastructure.llm import profiles as profile_capability
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.store.sqlite.tables.llm_profiles import LlmProfileRow


def list_profiles(role: AgentRole | str) -> list[LlmProfileRow]:
    return profile_capability.list_profiles(role)


def save_profile(
    role: AgentRole | str,
    profile_id: str,
    *,
    model: str,
    temperature: float,
    create: bool = False,
) -> LlmProfileRow:
    return profile_capability.save_profile(
        role,
        profile_id,
        model=model,
        temperature=temperature,
        create=create,
    )


def activate_profile(role: AgentRole | str, profile_id: str) -> LlmProfileRow:
    return profile_capability.activate_profile(role, profile_id)


def delete_profile(role: AgentRole | str, profile_id: str) -> None:
    profile_capability.delete_profile(role, profile_id)


def ensure_default_profiles() -> None:
    profile_capability.ensure_default_profiles()
