"""原子能力契约：`invoke_llm` 全链路（读配置 → 建客户端 → 落库），不触网。"""

import pytest

from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm import client
from teacheragent.infrastructure.store import repositories
from teacheragent.infrastructure.store.sqlite.tables.call_logs import CallLogRow


class _FakeResponse:
    content = "fake-answer"
    usage_metadata = {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}


class _FakeClient:
    def invoke(self, messages):
        return _FakeResponse()


def _latest() -> CallLogRow:
    logs = repositories.call_logs.list_by_role(str(AgentRole.TEACHER))
    assert logs, "日志未落库"
    return logs[0]


def test_success_writes_log_with_usage(monkeypatch):
    monkeypatch.setattr(client, "build_client", lambda _settings: _FakeClient())

    response = invoke_llm(
        AgentRole.TEACHER,
        [{"role": "user", "content": "hi"}],
        prompt_ref="capabilities/tutoring/prompts/teacher.md",
    )

    assert response.content == "fake-answer"
    log = _latest()
    assert log["status"] == "ok"
    assert log["role"] == "teacher"
    assert log["total_tokens"] == 3
    assert log["output_text"] == "fake-answer"
    assert log["prompt_ref"] == "capabilities/tutoring/prompts/teacher.md"


def test_client_build_failure_is_logged_and_reraised(monkeypatch):
    def _boom(_settings):
        raise RuntimeError("missing api key")

    monkeypatch.setattr(client, "build_client", _boom)

    with pytest.raises(RuntimeError, match="missing api key"):
        invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "hi"}])

    log = _latest()
    assert log["status"] == "error"
    assert "missing api key" in log["error"]


def test_settings_are_read_on_every_call(monkeypatch):
    """热更新：改配置后下一次调用即生效，无需重启。"""
    seen: list[float] = []

    def _capture(settings):
        seen.append(settings["temperature"])
        return _FakeClient()

    monkeypatch.setattr(client, "build_client", _capture)

    invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "a"}])
    repositories.llm_profiles.upsert_profile(
        str(AgentRole.TEACHER),
        "updated",
        model="gpt-4o-mini",
        temperature=0.1,
    )
    repositories.llm_profiles.activate_profile(str(AgentRole.TEACHER), "updated")
    invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "b"}])

    assert seen[0] != seen[1]
    assert seen[1] == 0.1
