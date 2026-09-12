"""LLM 固化配置：从 `llm.yaml` 读取模型候选、角色默认与默认温度。"""

from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

import yaml


class LlmSettings(TypedDict):
    """某角色的有效 LLM 配置。"""

    role: str
    provider: str
    model: str
    temperature: float


@dataclass(frozen=True)
class ModelOption:
    """模型候选。"""

    provider: str
    model: str
    label: str
    is_default: bool = False


YAML_FILE = Path(__file__).parent / "llm.yaml"
"""固化配置文件路径。"""


def _load_config() -> dict:
    """读取并解析固化配置；缺失时返回空字典。"""
    if not YAML_FILE.is_file():
        return {}
    return yaml.safe_load(YAML_FILE.read_text(encoding="utf-8")) or {}


def _options() -> tuple[ModelOption, ...]:
    raw_options = _load_config().get("models", [])
    return tuple(
        ModelOption(
            provider=raw.get("provider", ""),
            model=raw.get("model", ""),
            label=raw.get("label", raw.get("model", "")),
            is_default=bool(raw.get("is_default", False)),
        )
        for raw in raw_options
    )


def default_temperature() -> float:
    """用户未设置时使用的默认温度。"""
    return float(_load_config().get("default_temperature", 0.7))


def default_option() -> ModelOption:
    """全局默认模型项。"""
    options = _options()
    return next(option for option in options if option.is_default)


def find_option(model: str) -> ModelOption | None:
    """按模型名查找候选项，未收录时返回 None。"""
    return next((option for option in _options() if option.model == model), None)


def role_default_option(role: str) -> ModelOption:
    """某角色的默认模型项；未配置角色时回落到全局默认。"""
    model = _load_config().get("role_defaults", {}).get(role)
    if model:
        option = find_option(model)
        if option:
            return option
    return default_option()


def list_options() -> list[dict]:
    """候选清单（供前端展示）。"""
    return [
        {
            "provider": option.provider,
            "model": option.model,
            "label": option.label,
            "is_default": option.is_default,
        }
        for option in _options()
    ]
