"""LLM 配置域：模型候选清单、默认值与**有效配置契约**（纯配置，无副作用）。

`provider` 统一为 `openai`：当前通过 OpenAI 兼容网关（见 `.env` 的
`OPENCODE_BASE_URL`）路由到各模型，由网关按 `model` 名分发。

术语区分：
- ``LlmSettings``：**有效配置**（合并代码默认后的运行期配置），`build_client` 的入参。
- ``LlmSettingsRow``：**表存储形态**（含 ``id``/``updated_at``），见
  `store.sqlite.tables.llm_settings`。二者不可混用。
"""

from dataclasses import dataclass
from typing import TypedDict


class LlmSettings(TypedDict):
    """某角色的有效 LLM 配置（仓储读取后投影所得）。"""

    role: str
    provider: str
    model: str
    temperature: float


@dataclass(frozen=True)
class ModelOption:
    """候选模型。"""

    provider: str
    model: str
    label: str
    is_default: bool = False


DEFAULT_TEMPERATURE = 0.7
"""默认采样温度（用户未设置时使用）。"""

DEFAULT_MODELS: tuple[ModelOption, ...] = (
    ModelOption("openai", "gpt-4o-mini", "GPT-4o mini", is_default=True),
    ModelOption("openai", "gpt-4o", "GPT-4o"),
    ModelOption("openai", "claude-sonnet-4-5", "Claude Sonnet 4.5"),
)


def default_option() -> ModelOption:
    """默认模型项。"""
    return next(o for o in DEFAULT_MODELS if o.is_default)


def find_option(model: str) -> ModelOption | None:
    """按模型名查找候选项，未收录时返回 None。"""
    return next((o for o in DEFAULT_MODELS if o.model == model), None)


def list_options() -> list[dict]:
    """候选清单（供前端展示）。"""
    return [
        {"provider": o.provider, "model": o.model, "label": o.label, "is_default": o.is_default}
        for o in DEFAULT_MODELS
    ]
