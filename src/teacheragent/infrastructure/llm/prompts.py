"""提示词资产加载。

提示词绑定到具体能力：能力域角色设定在 `capabilities/<域>/prompts/`，
workflow 流水线提示词在 `workflows/<名>/prompts/`。顶层 `prompts/` 已取消。
"""

from dataclasses import dataclass
from importlib import resources

_PACKAGE = "teacheragent"


@dataclass(frozen=True)
class Prompt:
    """一次提示词加载结果。"""

    ref: str
    content: str


def load_prompt(ref: str) -> Prompt:
    """按包内相对路径加载提示词资产。

    `ref` 形如 `capabilities/tutoring/prompts/teacher.md`
    或 `workflows/content-pipeline/prompts/curriculum.md`。
    """
    normalized = ref.strip().lstrip("/")
    if "/prompts/" not in normalized or not normalized.endswith(".md"):
        raise ValueError(f"提示词路径必须形如 <能力域或 workflow>/prompts/<名称>.md：{ref}")
    target = resources.files(_PACKAGE)
    for part in normalized.split("/"):
        target = target.joinpath(part)
    return Prompt(ref=normalized, content=target.read_text(encoding="utf-8"))