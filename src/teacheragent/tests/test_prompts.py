"""提示词加载契约：所有 Agent 提示词集中在 `agent/prompts/`。"""

import pytest

from teacheragent.infrastructure.llm.prompts import (
    PROMPT_REGISTRY,
    PromptRenderError,
    _content_hash,
    build_messages,
    build_sys_messages,
    load_prompt,
)

TUTOR_PROMPT = "agent/prompts/tutor.md"
CURRICULUM_PROMPT = "agent/prompts/curriculum.md"
PROFILE_PARSE_PROMPT = "agent/prompts/profile-parse.md"


def test_load_tutor_prompt_returns_ref_and_content():
    prompt = load_prompt(TUTOR_PROMPT)
    assert prompt.ref == TUTOR_PROMPT
    assert "学习导师" in prompt.content
    assert prompt.content_hash.startswith("sha256:")


def test_load_prompt_content_hash_is_stable():
    first = load_prompt(TUTOR_PROMPT)
    second = load_prompt(TUTOR_PROMPT)

    assert first.content_hash == second.content_hash
    assert first.content_hash == _content_hash(first.content)


def test_content_hash_changes_when_content_changes():
    assert _content_hash("prompt-v1") != _content_hash("prompt-v2")


def test_load_curriculum_prompt_returns_content():
    prompt = load_prompt(CURRICULUM_PROMPT)
    assert prompt.ref == CURRICULUM_PROMPT
    assert prompt.content.strip()


def test_load_profile_prompt_returns_content():
    prompt = load_prompt(PROFILE_PARSE_PROMPT)
    assert prompt.ref == PROFILE_PARSE_PROMPT
    assert "用户画像解析" in prompt.content


def test_load_prompt_rejects_non_agent_prompt_asset():
    with pytest.raises(ValueError):
        load_prompt("capabilities/tutoring/prompts/teacher.md")


def test_load_prompt_rejects_nested_prompt_path():
    with pytest.raises(ValueError):
        load_prompt("agent/prompts/nested/invalid.md")


def test_load_prompt_rejects_missing_asset():
    with pytest.raises(FileNotFoundError):
        load_prompt("agent/prompts/不存在.md")


def test_build_sys_messages_renders_registered_template_with_injected_context():
    messages = build_sys_messages(
        capability="outline",
        context={
            "brief": {"goal": "掌握 Python 装饰器"},
            "learnerProfile": {"goals": ["半年内掌握装饰器"]},
        },
    )

    assert PROMPT_REGISTRY["outline"] == "agent/prompts/outline-architect.md"
    assert [message["role"] for message in messages] == ["system"]
    assert "教材大纲架构" in messages[0]["content"]
    assert '"goal": "掌握 Python 装饰器"' in messages[0]["content"]
    assert '"goals": [' in messages[0]["content"]
    assert "${{ " not in messages[0]["content"]


def test_build_messages_honours_explicit_role():
    messages = build_messages(
        capability="outline",
        context={"brief": {}, "learnerProfile": None},
        role="user",
    )

    assert [message["role"] for message in messages] == ["user"]
    assert "教材大纲架构" in messages[0]["content"]


def test_build_messages_rejects_missing_injected_item():
    with pytest.raises(PromptRenderError, match="learnerProfile"):
        build_sys_messages(capability="outline", context={"brief": {}})
