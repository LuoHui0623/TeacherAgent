"""结构化用户画像契约。

结构化画像是从权威 Markdown 解析出的派生资产。解析由 LLM 完成，进入大纲前
由 Pydantic 做确定性校验；来源版本与内容哈希属于运行上下文，不再塞进画像内容。
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LearningLevel = Literal["涉猎", "入门", "会用", "熟练", "进阶", "精通"]
"""技术条目允许的水平档位；允许留空，不写数值评分。"""


class ProfileParseError(RuntimeError):
    """画像解析失败；错误信息可直接呈现给用户。"""


class ProfileItem(BaseModel):
    """画像条目；`level` 仅技术条目使用。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    name: str = Field(min_length=1)
    level: LearningLevel | None = None
    note: str | None = None


class ExtraSection(BaseModel):
    """未命中受控分区的原文块。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    title: str | None = None
    text: str = ""


class StructuredProfile(BaseModel):
    """画像内容契约；分区缺失为 None。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Literal[3]
    primaryTech: list[ProfileItem] | None = None
    techStack: list[ProfileItem] | None = None
    education: str | None = None
    profession: str | None = None
    goals: list[str] | None = None
    preferences: list[str] | None = None
    learned: list[str] | None = None
    extras: list[ExtraSection] = Field(default_factory=list)


PROFILE_SECTION_KEYS: tuple[str, ...] = (
    "primaryTech",
    "techStack",
    "education",
    "profession",
    "goals",
    "preferences",
    "learned",
)
"""受控分区名，按「技术 → 用户背景」顺序，供测试与调用方检查。"""
