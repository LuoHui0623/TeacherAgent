"""LLM 配置：默认模型列表、环境变量读取、settings 读写（热更新）。

配置来源（优先级从高到低）：
1. llm_settings 表：当前选用模型 + 用户喜好 temperature（可改，随调用生效）
2. 代码内置：默认模型配置列表（DEFAULT_MODELS，标记默认项）
3. .env：LLM_BASE_URL（API 地址）
4. 系统环境变量：API Key（OPENAI_API_KEY 等，不落库）
"""

import os
from dataclasses import dataclass
from pathlib import Path

from teacheragent.store import execute, query
from teacheragent.store.sqlite.schemas import llm_settings as llm_settings_schema

# .env 加载（无 python-dotenv 依赖，简单解析 KEY=VALUE）
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


def _load_env_file() -> None:
    if not _ENV_FILE.exists():
        return
    for line in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


@dataclass(frozen=True)
class ModelOption:
    """候选模型选项。"""

    provider: str
    model: str
    is_default: bool = False


# 默认模型配置列表（OpenAI 兼容接口）
DEFAULT_MODELS: list[ModelOption] = [
    ModelOption(provider="openai", model="gpt-4o-mini", is_default=True),
    ModelOption(provider="openai", model="gpt-4o"),
    ModelOption(provider="openai", model="gpt-4.1-mini"),
    ModelOption(provider="anthropic", model="claude-sonnet-4-5"),
]

DEFAULT_TEMPERATURE = 0.7


def get_base_url() -> str:
    """API 地址：.env 的 LLM_BASE_URL，默认 OpenAI 官方。"""
    return os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1")


def get_api_key(provider: str) -> str:
    """API Key：系统环境变量（不落库）。"""
    env_names = {
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
    }
    return os.environ.get(env_names.get(provider, f"{provider.upper()}_API_KEY"), "")


def get_settings(role: str) -> dict:
    """读取某角色的当前 settings；无记录时用默认模型初始化。"""
    rows = query(
        f"SELECT * FROM {llm_settings_schema.TABLE} WHERE role = ?", (role,)
    )
    if rows:
        return rows[0]
    default = next(m for m in DEFAULT_MODELS if m.is_default)
    execute(
        f"INSERT INTO {llm_settings_schema.TABLE} (role, provider, model, temperature) VALUES (?, ?, ?, ?)",
        (role, default.provider, default.model, DEFAULT_TEMPERATURE),
    )
    return query(
        f"SELECT * FROM {llm_settings_schema.TABLE} WHERE role = ?", (role,)
    )[0]


def update_settings(role: str, *, model: str | None = None, temperature: float | None = None) -> None:
    """更新用户喜好（模型 / temperature），下一次调用即生效。"""
    current = get_settings(role)
    new_model = model or current["model"]
    new_temp = temperature if temperature is not None else current["temperature"]
    provider = next((m.provider for m in DEFAULT_MODELS if m.model == new_model), current["provider"])
    execute(
        f"UPDATE {llm_settings_schema.TABLE} SET model = ?, provider = ?, temperature = ?, "
        "updated_at = datetime('now') WHERE role = ?",
        (new_model, provider, new_temp, role),
    )


def list_model_options() -> list[dict]:
    """内置候选模型列表（供前端展示）。"""
    return [{"provider": m.provider, "model": m.model, "is_default": m.is_default} for m in DEFAULT_MODELS]
