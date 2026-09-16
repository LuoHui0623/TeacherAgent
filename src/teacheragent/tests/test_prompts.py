"""提示词加载契约：按包内相对路径读取 Markdown 资产，拒绝非提示词路径。"""

import pytest

from teacheragent.infrastructure.llm.prompts import load_prompt

CAPABILITY_PROMPT = "capabilities/tutoring/prompts/teacher.md"
WORKFLOW_PROMPT = "workflows/content-pipeline/prompts/curriculum.md"
PROFILE_MAINTAIN_PROMPT = "capabilities/profile/prompts/maintain.md"
PROFILE_PARSE_PROMPT = "capabilities/profile/prompts/parse.md"


def test_load_capability_prompt_returns_ref_and_content():
    prompt = load_prompt(CAPABILITY_PROMPT)
    assert prompt.ref == CAPABILITY_PROMPT
    assert "# 教师 Agent 提示词" in prompt.content


def test_load_workflow_prompt_returns_content():
    prompt = load_prompt(WORKFLOW_PROMPT)
    assert prompt.ref == WORKFLOW_PROMPT
    assert prompt.content.strip()


def test_load_prompt_rejects_non_prompt_asset():
    with pytest.raises(ValueError):
        load_prompt("capabilities/tutoring/README.md")


def test_load_prompt_rejects_missing_asset():
    with pytest.raises(FileNotFoundError):
        load_prompt("capabilities/tutoring/prompts/不存在.md")

def test_load_profile_prompts():
    maintain = load_prompt(PROFILE_MAINTAIN_PROMPT)
    parse = load_prompt(PROFILE_PARSE_PROMPT)
    assert maintain.ref == PROFILE_MAINTAIN_PROMPT
    assert parse.ref == PROFILE_PARSE_PROMPT
    assert "# 用户画像维护" in maintain.content
    assert "# 用户画像解析" in parse.content


def test_maintain_prompt_declares_all_controlled_sections():
    """维护提示词必须声明全部受控分区，避免它与设计文档漂移。"""
    content = load_prompt(PROFILE_MAINTAIN_PROMPT).content
    for section in (
        "主修技术",
        "技术栈",
        "已学内容",
        "感兴趣",
        "学业背景",
        "职业背景",
        "学习目标",
        "薄弱点",
        "学习偏好",
    ):
        assert section in content, f"维护提示词缺少分区：{section}"


def test_parse_prompt_keeps_extraction_only_constraint():
    content = load_prompt(PROFILE_PARSE_PROMPT).content
    assert "只做提取，不做推断" in content
    assert "warnings" in content