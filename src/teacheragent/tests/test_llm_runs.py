"""llm_runs 生命周期与查询 API。"""

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.store import repositories
from teacheragent.services.llm import catalog as catalog_service


class _Response:
    content = "answer"
    usage_metadata = {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5}


class _Model:
    def invoke(self, messages):
        return _Response()


def test_invoke_creates_uuid_run_with_full_input(monkeypatch):
    monkeypatch.setattr(client, "build_client", lambda _settings: _Model())

    invoke_llm(AgentRole.TUTOR, [{"role": "user", "content": "hello"}])

    rows = repositories.llm_runs.list_runs(role="tutor")
    assert len(rows) == 1
    assert len(rows[0]["run_id"]) == 36
    assert rows[0]["status"] == "success"
    assert rows[0]["total_tokens"] == 5


def test_runs_api_separates_summary_and_detail(monkeypatch):
    monkeypatch.setattr(catalog_service, "refresh_models", lambda: {"models": []})
    repositories.llm_runs.create_run(
        run={
            "run_id": "00000000-0000-0000-0000-000000000001",
            "task_id": "00000000-0000-0000-0000-000000000002",
            "query_id": "00000000-0000-0000-0000-000000000003",
            "sequence": 1,
            "attempt": 1,
            "role": "tutor",
            "provider": "openai",
            "model": "model-a",
            "temperature": 0.7,
            "prompt_sources": [{"content_hash": "sha256:test"}],
            "input_messages": [{"role": "user", "content": "hello"}],
            "tools": [],
            "started_at": "2026-10-01T00:00:00+00:00",
        }
    )
    repositories.llm_runs.finish_run(
        run_id="00000000-0000-0000-0000-000000000001",
        values={"status": "success", "completed_at": "2026-10-01T00:00:01+00:00", "duration_ms": 1},
    )

    with TestClient(app) as test_client:
        summary = test_client.get("/llm/runs?source_hash=sha256:test")
        detail = test_client.get("/llm/runs/00000000-0000-0000-0000-000000000001")

    assert summary.status_code == 200
    assert "input_messages" not in summary.json()["runs"][0]
    assert detail.status_code == 200
    assert detail.json()["input_messages"][0]["content"] == "hello"
