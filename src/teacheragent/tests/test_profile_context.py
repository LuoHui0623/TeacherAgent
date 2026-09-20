"""T5：当前画像解析并进入大纲运行上下文。"""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from teacheragent.capabilities.outline.messages import build_outline_messages
from teacheragent.capabilities.profile import parse as parse_module
from teacheragent.capabilities.profile.contracts import (
    PROFILE_SECTION_KEYS,
    ProfileParseError,
    StructuredProfile,
)
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.store import repositories
from teacheragent.infrastructure.store.sqlite.repositories import user_profiles as repo
from teacheragent.services import profile_context

VERSION_ID = "admin-20260919120000"
CONTENT_HASH = "sha256:test"
BASE = datetime(2026, 9, 19, 12, 0, 0, tzinfo=UTC)


def _structured_profile() -> dict:
    sections = {
        key: {"present": False, "text": "", "items": []}
        for key in PROFILE_SECTION_KEYS
    }
    sections["primaryTech"] = {
        "present": True,
        "text": "Python（进阶）",
        "items": [{"name": "Python", "level": "进阶"}],
    }
    return {
        "version": 2,
        "overview": {"present": False, "text": ""},
        "sections": sections,
        "extras": [],
        "warnings": [],
    }


def test_parse_profile_markdown_uses_curriculum_role_and_returns_model(monkeypatch):
    seen: dict = {}

    def _invoke(role, messages):
        seen["role"] = role
        seen["messages"] = messages
        return SimpleNamespace(content=json.dumps(_structured_profile(), ensure_ascii=False))

    monkeypatch.setattr(parse_module, "invoke_llm", _invoke)

    markdown = "\n".join([
        "# 用户画像",
        "",
        "## 主修技术",
        "",
        "Python（进阶）",
        "",
    ])
    profile = parse_module.parse_profile_markdown(
        markdown,
        markdown_version_id=VERSION_ID,
        content_hash=CONTENT_HASH,
    )

    assert seen["role"] == AgentRole.CURRICULUM
    assert "只做提取，不做推断" in seen["messages"][0]["content"]
    assert "Python（进阶）" in seen["messages"][1]["content"]
    assert VERSION_ID in seen["messages"][1]["content"]
    assert CONTENT_HASH in seen["messages"][1]["content"]
    assert profile.sections.primaryTech.items[0].name == "Python"
    assert profile.sections.primaryTech.items[0].level == "进阶"


def test_parse_profile_markdown_rejects_invalid_json(monkeypatch):
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(content="not-json"),
    )

    with pytest.raises(ProfileParseError, match="合法 JSON"):
        parse_module.parse_profile_markdown(
            "# 用户画像",
            markdown_version_id=VERSION_ID,
            content_hash=CONTENT_HASH,
        )


def test_parse_profile_markdown_rejects_missing_controlled_sections(monkeypatch):
    payload = _structured_profile()
    del payload["sections"]["weaknesses"]
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(
            content=json.dumps(payload, ensure_ascii=False)
        ),
    )

    with pytest.raises(ProfileParseError, match="weaknesses"):
        parse_module.parse_profile_markdown(
            "# 用户画像",
            markdown_version_id=VERSION_ID,
            content_hash=CONTENT_HASH,
        )


def test_parse_profile_markdown_rejects_unknown_fields(monkeypatch):
    payload = _structured_profile()
    payload["sections"]["primaryTech"]["unexpected"] = True
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(
            content=json.dumps(payload, ensure_ascii=False)
        ),
    )

    with pytest.raises(ProfileParseError, match="未知字段"):
        parse_module.parse_profile_markdown(
            "# 用户画像",
            markdown_version_id=VERSION_ID,
            content_hash=CONTENT_HASH,
        )


def test_load_context_reads_current_version_and_binds_source(monkeypatch):
    row = repo.save_version(
        "admin",
        "# 用户画像\n\n## 主修技术\n\nPython（进阶）\n",
        at=BASE,
    )
    captured: dict = {}

    def _parse(markdown: str, *, markdown_version_id: str, content_hash: str):
        captured["markdown"] = markdown
        captured["markdown_version_id"] = markdown_version_id
        captured["content_hash"] = content_hash
        return StructuredProfile.model_validate(_structured_profile())

    monkeypatch.setattr(profile_context, "parse_profile_markdown", _parse)

    context = profile_context.load_outline_profile_context("admin")

    assert captured["markdown"] == row["content"]
    assert captured["markdown_version_id"] == row["id"]
    assert captured["content_hash"] == row["content_hash"]
    assert context.markdown_version_id == row["id"]
    assert context.content_hash == row["content_hash"]
    assert context.profile.sections.primaryTech.items[0].name == "Python"


def test_load_context_stops_when_no_profile_exists():
    with pytest.raises(ProfileParseError, match="没有用户画像"):
        profile_context.load_outline_profile_context("admin")


def test_profile_parse_call_log_contains_markdown_version_anchor(monkeypatch):
    row = repo.save_version(
        "admin",
        "# 用户画像\n\n## 主修技术\n\nPython（进阶）\n",
        at=BASE,
    )

    class _FakeResponse:
        content = json.dumps(_structured_profile(), ensure_ascii=False)

    class _FakeClient:
        def invoke(self, _messages):
            return _FakeResponse()

    monkeypatch.setattr(llm_client, "build_client", lambda _settings: _FakeClient())

    context = profile_context.load_outline_profile_context("admin")

    logs = repositories.call_logs.list_by_role(str(AgentRole.CURRICULUM))
    assert logs
    assert row["id"] in logs[0]["input_text"]
    assert row["content_hash"] in logs[0]["input_text"]
    assert context.markdown_version_id == row["id"]
    assert context.content_hash == row["content_hash"]


def test_outline_messages_keep_profile_and_source_separate():
    messages = build_outline_messages(
        {"goal": "掌握 Python 装饰器"},
        StructuredProfile.model_validate(_structured_profile()),
        markdown_version_id=VERSION_ID,
        content_hash=CONTENT_HASH,
    )

    assert messages[0]["role"] == "system"
    assert "画像使用规则" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert '"markdownVersionId": "admin-20260919120000"' in messages[1]["content"]
    assert '"contentHash": "sha256:test"' in messages[1]["content"]
    assert "掌握 Python 装饰器" in messages[1]["content"]
