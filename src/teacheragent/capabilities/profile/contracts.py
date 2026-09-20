"""结构化用户画像契约。

结构化画像是从权威 Markdown 解析出的派生资产。解析由 LLM 完成，进入大纲前
由 Pydantic 做确定性校验；来源版本与内容哈希属于运行上下文，不再塞进画像内容。
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

LearningLevel = Literal["涉猎", "入门", "会用", "熟练", "进阶", "精通"]
"""技术条目允许的水平档位。"""


class ProfileParseError(RuntimeError):
    """画像解析失败；错误信息可直接呈现给用户。"""


class ProfileItem(BaseModel):
    """分区内的结构化条目。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    name: str = Field(min_length=1)
    level: LearningLevel | None = None
    primary: bool | None = None
    note: str | None = None


class ProfileSection(BaseModel):
    """一个受控分区的原文与条目。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    present: bool
    text: str
    items: list[ProfileItem]


class ProfileTextBlock(BaseModel):
    """无条目的文本块，例如 overview。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    present: bool
    text: str


class ProfileWarning(BaseModel):
    """给用户看的非阻塞解析告警。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    code: str
    detail: str


class ProfileSections(BaseModel):
    """固定的受控分区集合；缺失或新增分区都由 Pydantic 拒绝。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    primaryTech: ProfileSection
    techStack: ProfileSection
    learned: ProfileSection
    interests: ProfileSection
    education: ProfileSection
    profession: ProfileSection
    goals: ProfileSection
    weaknesses: ProfileSection
    preferences: ProfileSection


class StructuredProfile(BaseModel):
    """画像内容契约；不包含运行来源、版本文件或存储元数据。"""
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Literal[2]
    overview: ProfileTextBlock
    sections: ProfileSections
    extras: list[dict[str, Any]]
    warnings: list[ProfileWarning]


PROFILE_SECTION_KEYS = tuple(ProfileSections.model_fields)
"""受控分区键，供测试与调用方检查结构。"""
