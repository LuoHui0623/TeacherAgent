"""T5：当前画像解析并进入大纲运行上下文。"""

import json
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from teacheragent.capabilities.outline.messages import build_outline_messages
from teacheragent.capabilities.profile import parse as parse_module
from teacheragent.capabilities.profile.contracts import (
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
OUTLINE_PROMPT_REF = "agent/prompts/outline-architect.md"
"""大纲节点在图定义里声明的提示词资产路径。"""


def _structured_profile() -> dict:
    return {
        "version": 3,
        "primaryTech": [
            {"name": "Python", "level": "进阶", "note": "能独立设计后端服务"},
        ],
        "techStack": [
            {"name": "Python", "level": "进阶", "note": "能独立设计后端服务"},
        ],
        "education": "本科，非计算机专业。",
        "profession": "数据分析师，junior。",
        "goals": ["掌握 Python 装饰器"],
        "preferences": ["示例先行"],
        "learned": ["机器学习：线性回归、决策树"],
        "extras": [],
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
    system, user = seen["messages"].messages
    assert "只做提取，不做推断" in system["content"]
    assert "Python（进阶）" in user["content"]
    assert VERSION_ID in user["content"]
    assert CONTENT_HASH in user["content"]
    assert profile.primaryTech is not None
    assert profile.primaryTech[0].name == "Python"
    assert profile.primaryTech[0].level == "进阶"


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


def test_parse_profile_markdown_allows_missing_partitions(monkeypatch):
    payload = _structured_profile()
    del payload["primaryTech"]
    payload["goals"] = None
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(
            content=json.dumps(payload, ensure_ascii=False)
        ),
    )

    profile = parse_module.parse_profile_markdown(
        "# 用户画像",
        markdown_version_id=VERSION_ID,
        content_hash=CONTENT_HASH,
    )

    assert profile.primaryTech is None
    assert profile.goals is None
    assert profile.techStack is not None
    assert profile.education == "本科，非计算机专业。"


def test_parse_profile_markdown_keeps_unknown_partition_in_extras(monkeypatch):
    payload = _structured_profile()
    payload["extras"] = [
        {"title": None, "text": "# 用户画像"},
        {"title": "工作习惯", "text": "早上学习效率更高。"},
    ]
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(
            content=json.dumps(payload, ensure_ascii=False)
        ),
    )

    profile = parse_module.parse_profile_markdown(
        "# 用户画像",
        markdown_version_id=VERSION_ID,
        content_hash=CONTENT_HASH,
    )

    assert profile.extras[0].title is None
    assert profile.extras[1].title == "工作习惯"
    assert profile.extras[1].text == "早上学习效率更高。"


def test_parse_profile_markdown_rejects_wrong_partition_shape(monkeypatch):
    payload = _structured_profile()
    payload["education"] = [{"name": "本科"}]
    monkeypatch.setattr(
        parse_module,
        "invoke_llm",
        lambda _role, _messages: SimpleNamespace(
            content=json.dumps(payload, ensure_ascii=False)
        ),
    )

    with pytest.raises(ProfileParseError, match="契约"):
        parse_module.parse_profile_markdown(
            "# 用户画像",
            markdown_version_id=VERSION_ID,
            content_hash=CONTENT_HASH,
        )


def test_parse_profile_markdown_rejects_unknown_partition(monkeypatch):
    payload = _structured_profile()
    payload["weaknesses"] = [{"name": "线程模型混淆"}]
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


def test_parse_profile_markdown_rejects_unknown_fields(monkeypatch):
    payload = _structured_profile()
    payload["primaryTech"][0]["unexpected"] = True
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
    assert context.profile.primaryTech is not None
    assert context.profile.primaryTech[0].name == "Python"


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

    runs = repositories.llm_runs.list_runs(role=str(AgentRole.CURRICULUM))
    assert runs
    assert row["id"] in runs[0]["input_messages_json"]
    assert row["content_hash"] in runs[0]["input_messages_json"]
    assert context.markdown_version_id == row["id"]
    assert context.content_hash == row["content_hash"]


def test_outline_messages_inject_brief_and_profile():
    messages = build_outline_messages(
        {"goal": "掌握 Python 装饰器"},
        StructuredProfile.model_validate(_structured_profile()),
        prompt_ref=OUTLINE_PROMPT_REF,
    )

    assert [message["role"] for message in messages.messages] == ["system", "user"]
    system = messages.messages[0]["content"]
    user = messages.messages[1]["content"]
    assert "排序与取舍由已确认的 `brief` 与 `learnerProfile` 决定" in system
    assert '"goal": "掌握 Python 装饰器"' in user
    assert '"primaryTech": [' in user
    assert "${{ " not in system
    assert "${{ " not in user
    assert {source.ref for source in messages.sources} == {OUTLINE_PROMPT_REF}
