"""编排层契约：`invoke_llm` 全链路（读配置 → 建客户端 → 落库），不触网。"""

import pytest

from teacheragent.constants import AgentRole
from teacheragent.services import llm
from teacheragent.store import repositories
from teacheragent.store.sqlite import database


class _FakeResponse:
    content = "fake-answer"
    usage_metadata = {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}


class _FakeClient:
    def invoke(self, messages):
        return _FakeResponse()


def _logs() -> list[dict]:
    return database.query("SELECT * FROM call_logs ORDER BY id")


def test_success_writes_log_with_usage(monkeypatch):
    monkeypatch.setattr(llm.llm_client, "build_client", lambda _settings: _FakeClient())

    response = llm.invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "hi"}])

    assert response.content == "fake-answer"
    log = _logs()[0]
    assert log["status"] == "ok"
    assert log["role"] == "teacher"
    assert log["total_tokens"] == 3
    assert log["output_text"] == "fake-answer"


def test_client_build_failure_is_logged_and_reraised(monkeypatch):
    def _boom(_settings):
        raise RuntimeError("missing api key")

    monkeypatch.setattr(llm.llm_client, "build_client", _boom)

    with pytest.raises(RuntimeError, match="missing api key"):
        llm.invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "hi"}])

    log = _logs()[0]
    assert log["status"] == "error"
    assert "missing api key" in log["error"]


def test_settings_are_read_on_every_call(monkeypatch):
    """热更新：改配置后下一次调用即生效，无需重启。"""
    seen: list[float] = []

    def _capture(settings):
        seen.append(settings["temperature"])
        return _FakeClient()

    monkeypatch.setattr(llm.llm_client, "build_client", _capture)

    llm.invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "a"}])
    repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.1)
    llm.invoke_llm(AgentRole.TEACHER, [{"role": "user", "content": "b"}])

    assert seen[0] != seen[1]
    assert seen[1] == 0.1
