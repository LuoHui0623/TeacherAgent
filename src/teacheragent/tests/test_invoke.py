"""原子能力契约：`invoke_llm` 全链路（读配置 → 建客户端 → 落库），不触网。"""

import pytest

from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.store import repositories
from teacheragent.infrastructure.store.sqlite.tables.llm_runs import LlmRunRow


class _FakeResponse:
    content = "fake-answer"
    usage_metadata = {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3}


class _FakeClient:
    def invoke(self, messages):
        return _FakeResponse()


def _latest() -> LlmRunRow:
    rows = repositories.llm_runs.list_runs(role=str(AgentRole.TUTOR))
    assert rows, "运行记录未落库"
    return rows[0]


def test_success_writes_run_with_usage(monkeypatch):
    monkeypatch.setattr(client, "build_client", lambda _settings: _FakeClient())

    response = invoke_llm(
        AgentRole.TUTOR,
        [{"role": "user", "content": "hi"}],
    )

    assert response.content == "fake-answer"
    run = _latest()
    assert run["status"] == "success"
    assert run["role"] == "tutor"
    assert run["total_tokens"] == 3
    assert "fake-answer" in run["output_message_json"]


def test_client_build_failure_propagates_without_run_record(monkeypatch):
    """建客户端失败发生在记录边界之外，因此不产生 `llm_runs` 行。"""

    def _boom(_settings):
        raise RuntimeError("missing api key")

    monkeypatch.setattr(client, "build_client", _boom)

    with pytest.raises(RuntimeError, match="missing api key"):
        invoke_llm(AgentRole.TUTOR, [{"role": "user", "content": "hi"}])

    assert repositories.llm_runs.list_runs(role=str(AgentRole.TUTOR)) == []


def test_settings_are_read_on_every_call(monkeypatch):
    """热更新：改配置后下一次调用即生效，无需重启。"""
    seen: list[float] = []

    def _capture(settings):
        seen.append(settings["temperature"])
        return _FakeClient()

    monkeypatch.setattr(client, "build_client", _capture)

    invoke_llm(AgentRole.TUTOR, [{"role": "user", "content": "a"}])
    repositories.llm_profiles.upsert_profile(
        str(AgentRole.TUTOR),
        "updated",
        model="gpt-4o-mini",
        temperature=0.1,
    )
    repositories.llm_profiles.activate_profile(str(AgentRole.TUTOR), "updated")
    invoke_llm(AgentRole.TUTOR, [{"role": "user", "content": "b"}])

    assert seen[0] != seen[1]
    assert seen[1] == 0.1

