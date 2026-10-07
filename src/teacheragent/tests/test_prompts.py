"""提示词加载契约：所有 Agent 提示词集中在 `agent/prompts/`。"""

import pytest

from teacheragent.infrastructure.llm.prompts import (
    PromptFormatError,
    PromptRenderError,
    _content_hash,
    load_prompt,
    read_prompt,
    render_prompt,
    split_prompt_text,
    template_variables,
)
from teacheragent.infrastructure.store.sqlite.repositories import prompt_snapshots

TUTOR_PROMPT = "agent/prompts/tutor.md"
PROFILE_PARSE_PROMPT = "agent/prompts/profile-parse.md"
OUTLINE_PROMPT = "agent/prompts/outline-architect.md"


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


def test_load_profile_prompt_returns_content():
    prompt = load_prompt(PROFILE_PARSE_PROMPT)
    assert prompt.ref == PROFILE_PARSE_PROMPT
    assert "用户画像解析" in prompt.content


def test_loading_a_prompt_freezes_its_snapshot():
    """加载即冻结：提示词历史从快照表回溯，不靠 git，也没有文件以外的写入点。"""
    prompt = load_prompt(TUTOR_PROMPT)

    rows = prompt_snapshots.list_snapshots(ref=TUTOR_PROMPT)
    assert [row["content_hash"] for row in rows] == [prompt.content_hash]
    assert rows[0]["content"] == prompt.content


def test_loading_the_same_prompt_twice_keeps_one_snapshot():
    load_prompt(TUTOR_PROMPT)
    load_prompt(TUTOR_PROMPT)

    assert len(prompt_snapshots.list_snapshots(ref=TUTOR_PROMPT)) == 1


def test_load_prompt_rejects_non_agent_prompt_asset():
    with pytest.raises(ValueError):
        load_prompt("capabilities/tutoring/prompts/teacher.md")


def test_load_prompt_rejects_nested_prompt_path():
    with pytest.raises(ValueError):
        load_prompt("agent/prompts/nested/invalid.md")


def test_load_prompt_rejects_missing_asset():
    with pytest.raises(FileNotFoundError):
        load_prompt("agent/prompts/不存在.md")


def test_render_prompt_splits_a_template_that_declares_variables():
    prompt = load_prompt(OUTLINE_PROMPT)
    messages = render_prompt(
        prompt,
        {
            "brief": {"goal": "掌握 Python 装饰器"},
            "learnerProfile": {"goals": ["半年内掌握装饰器"]},
        },
    )

    assert [message["role"] for message in messages.messages] == ["system", "user"]
    assert messages.messages[0]["content"] == prompt.static_prefix
    assert "教材大纲架构" in messages.messages[0]["content"]
    assert "${{ " not in messages.messages[0]["content"]
    assert '"goal": "掌握 Python 装饰器"' in messages.messages[1]["content"]
    assert '"goals": [' in messages.messages[1]["content"]
    assert "${{ " not in messages.messages[1]["content"]


def test_render_prompt_keeps_a_template_without_variables_in_one_message():
    prompt = load_prompt(TUTOR_PROMPT)

    assert prompt.variables == ()
    assert prompt.injection is None
    assert render_prompt(prompt).messages == [{"role": "system", "content": prompt.content}]


def test_render_prompt_records_the_source_identity_of_each_message():
    prompt = load_prompt(OUTLINE_PROMPT)
    messages = render_prompt(prompt, {"brief": {}, "learnerProfile": None})

    assert messages.template_text == prompt.content
    assert messages.injected_context == {"brief": {}, "learnerProfile": None}
    assert [(source.ref, source.name, source.order) for source in messages.sources] == [
        (OUTLINE_PROMPT, "outline-architect", 0),
        (OUTLINE_PROMPT, "outline-architect", 1),
    ]
    assert [source.role for source in messages.sources] == ["system", "user"]
    assert [source.content_hash for source in messages.sources] == [prompt.content_hash] * 2
    assert [source.template_text for source in messages.sources] == [
        prompt.static_prefix,
        prompt.injection,
    ]
    assert [source.rendered_text for source in messages.sources] == [
        message["content"] for message in messages.messages
    ]


def test_render_prompt_honours_explicit_roles():
    messages = render_prompt(
        load_prompt(OUTLINE_PROMPT),
        {"brief": {}, "learnerProfile": None},
        role="system-custom",
        payload_role="user-custom",
    )

    assert [message["role"] for message in messages.messages] == ["system-custom", "user-custom"]
    assert "教材大纲架构" in messages.messages[0]["content"]


def test_render_prompt_rejects_missing_injected_item():
    with pytest.raises(PromptRenderError, match="learnerProfile"):
        render_prompt(load_prompt(OUTLINE_PROMPT), {"brief": {}})


def test_load_prompt_reports_the_declared_variables():
    assert load_prompt(OUTLINE_PROMPT).variables == ("brief", "learnerProfile")
    assert load_prompt(PROFILE_PARSE_PROMPT).variables == (
        "markdownVersionId",
        "contentHash",
        "markdown",
    )
    assert load_prompt(TUTOR_PROMPT).variables == ()


def test_template_variables_keep_first_appearance_order_without_repeats():
    assert template_variables("${{ b }} ${{ a }} ${{ b }}") == ("b", "a")


def test_read_prompt_does_not_freeze_a_snapshot():
    """读接口只读资产；只有真正装载发送的那一次调用才追加版本。"""
    prompt = read_prompt(TUTOR_PROMPT)

    assert prompt_snapshots.list_snapshots(ref=TUTOR_PROMPT) == []
    assert load_prompt(TUTOR_PROMPT).content_hash == prompt.content_hash
    assert len(prompt_snapshots.list_snapshots(ref=TUTOR_PROMPT)) == 1


def test_render_prompt_splits_static_prefix_and_injection_payload():
    prompt = load_prompt(PROFILE_PARSE_PROMPT)
    messages = render_prompt(
        prompt,
        {
            "markdownVersionId": "admin-20260919120000",
            "contentHash": "sha256:test",
            "markdown": "## 主修技术\n\nPython（进阶）",
        },
    )

    assert [message["role"] for message in messages.messages] == ["system", "user"]
    assert messages.messages[0]["content"] == prompt.static_prefix
    assert "用户画像解析" in messages.messages[0]["content"]
    assert '"contentHash": "sha256:test"' in messages.messages[1]["content"]
    assert "画像 Markdown：" in messages.messages[1]["content"]
    assert "Python（进阶）" in messages.messages[1]["content"]
    assert "${{ " not in messages.messages[1]["content"]
    assert [source.role for source in messages.sources] == ["system", "user"]


def test_profile_parse_payload_pins_the_injected_text():
    """注入载荷从声明变量的段落开始，到文末结束。"""
    messages = render_prompt(
        load_prompt(PROFILE_PARSE_PROMPT),
        {
            "markdownVersionId": "admin-20260919120000",
            "contentHash": "sha256:test",
            "markdown": "## 主修技术\n\nPython（进阶）\n",
        },
    )

    assert messages.messages[1]["content"] == "\n".join([
        "```json",
        "{",
        '  "markdownVersionId": "admin-20260919120000",',
        '  "contentHash": "sha256:test"',
        "}",
        "```",
        "",
        "画像 Markdown：",
        "",
        "```markdown",
        "## 主修技术",
        "",
        "Python（进阶）",
        "",
        "```",
    ])
    assert messages.messages[0]["content"] == load_prompt(PROFILE_PARSE_PROMPT).static_prefix


def test_tutor_prompt_renders_one_source_with_the_asset_identity():
    prompt = load_prompt(TUTOR_PROMPT)
    messages = render_prompt(prompt)

    assert messages.messages == [{"role": "system", "content": prompt.content}]
    source = messages.sources[0]
    assert (source.ref, source.name, source.order) == (TUTOR_PROMPT, "tutor", 0)
    assert source.content_hash == prompt.content_hash
    assert source.template_text == source.rendered_text == prompt.content


def test_split_prompt_text_takes_the_first_paragraph_that_declares_variables():
    content = "规则。\n\n说明。\n\n${{ a }}\n\n${{ b }}\n"

    assert split_prompt_text("ref", content) == ("规则。\n\n说明。", "${{ a }}\n\n${{ b }}")


def test_split_prompt_text_keeps_a_static_prompt_whole():
    assert split_prompt_text("ref", "规则。\n\n说明。\n") == ("规则。\n\n说明。", None)


def test_split_prompt_text_rejects_a_template_without_a_static_prefix():
    with pytest.raises(PromptFormatError, match="没有静态前缀"):
        split_prompt_text("ref", "${{ a }}\n")


def test_asset_templates_keep_all_variables_in_the_payload():
    """载荷从第一个声明变量的段落开始，所以静态前缀里不该再有占位符。"""
    for ref in (OUTLINE_PROMPT, PROFILE_PARSE_PROMPT):
        prompt = load_prompt(ref)
        assert prompt.injection is not None, ref
        assert "${{ " not in prompt.static_prefix, ref
        assert "${{ " in prompt.injection, ref
        assert prompt.injection.startswith("```json"), ref
