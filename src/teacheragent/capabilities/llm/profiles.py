"""按角色隔离的 Profile 能力：校验、创建、编辑、删除与切换。"""

import re

from teacheragent.capabilities.llm import catalog
from teacheragent.config import llm
from teacheragent.constants import AgentRole
from teacheragent.store import repositories
from teacheragent.store.sqlite.tables.llm_profiles import LlmProfileRow


PROFILE_ID_PATTERN = re.compile(r"^[\S](.*[\S])?$", re.DOTALL)
"""允许中英文、空格和常用符号；禁止空串、纯空白与控制字符。"""

DEFAULT_PROFILE_ID = "default"
"""启动时自动维护的系统默认 Profile name。"""


def list_profiles(role: AgentRole | str) -> list[LlmProfileRow]:
    """列出某角色 Profile，激活项排在最前。"""
    key = _role_key(role)
    return repositories.llm_profiles.list_profiles(key)


def save_profile(
    role: AgentRole | str,
    profile_id: str,
    *,
    model: str,
    temperature: float,
    create: bool = False,
) -> LlmProfileRow:
    """创建或更新 Profile；模型必须在当前内存目录中。"""
    key = _role_key(role)
    name = _profile_id_key(profile_id)
    if not _is_supported_model(model):
        raise ValueError(f"模型不在当前目录中：{model}")
    if not 0 <= temperature <= 2:
        raise ValueError("temperature 必须在 0 到 2 之间")
    existing = repositories.llm_profiles.get_profile(key, name)
    if create and existing is not None:
        raise ValueError(f"Profile 已存在：{name}")
    if not create and existing is None:
        raise LookupError(f"Profile 不存在：{name}")
    return repositories.llm_profiles.upsert_profile(
        key,
        name,
        model=model,
        temperature=float(temperature),
    )


def activate_profile(role: AgentRole | str, profile_id: str) -> LlmProfileRow:
    """切换当前激活 Profile；下一次调用立即读取新配置。"""
    key = _role_key(role)
    name = _profile_id_key(profile_id)
    profile = repositories.llm_profiles.get_profile(key, name)
    if profile is None:
        raise LookupError(f"Profile 不存在：{name}")
    if not profile["valid"]:
        raise ValueError(f"Profile 模型当前不可用：{profile['model']}")
    return repositories.llm_profiles.activate_profile(key, name)


def delete_profile(role: AgentRole | str, profile_id: str) -> None:
    """删除非激活 Profile；激活 Profile 不允许删除。"""
    key = _role_key(role)
    name = _profile_id_key(profile_id)
    repositories.llm_profiles.delete_profile(key, name)


def ensure_default_profiles() -> None:
    """模型目录加载后，为每个角色准备并校正可用的全局默认 Profile。"""
    models = catalog.list_models()
    if not models:
        return
    default_model = _preferred_default_model(models)
    for role in AgentRole:
        key = str(role)
        current = repositories.llm_profiles.get_active(key)
        if (
            current
            and current["valid"]
            and current["profile_id"] != DEFAULT_PROFILE_ID
        ):
            continue
        default_profile = repositories.llm_profiles.get_profile(key, DEFAULT_PROFILE_ID)
        if default_profile is None or default_profile["model"] != default_model:
            repositories.llm_profiles.upsert_profile(
                key,
                DEFAULT_PROFILE_ID,
                model=default_model,
                temperature=llm.default_temperature(),
            )
        repositories.llm_profiles.activate_profile(key, DEFAULT_PROFILE_ID)


def _role_key(role: AgentRole | str) -> str:
    key = str(role)
    try:
        return str(AgentRole(key))
    except ValueError as exc:
        raise ValueError(f"未知角色：{key}") from exc


def _profile_id_key(profile_id: str) -> str:
    name = profile_id.strip()
    if not name or len(name) > 64 or any(ord(char) < 32 for char in name):
        raise ValueError("Profile name 不能为空，且长度不超过 64")
    if not PROFILE_ID_PATTERN.fullmatch(name):
        raise ValueError("Profile name 不能为纯空白或包含控制字符")
    return name


def _is_supported_model(model: str) -> bool:
    return bool(model) and catalog.model_exists(model)


def _preferred_default_model(models: tuple[str, ...]) -> str:
    """优先使用固化配置中仍可用的模型，否则使用目录首项。"""
    for role in AgentRole:
        configured = llm.role_default_option(str(role)).model
        if configured in models:
            return configured
    return models[0]
