"""API 契约：提示词地图从 `llm_runs` 读取调用时间流。"""

import json

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.infrastructure.store import repositories
from teacheragent.services.llm import catalog as catalog_service


def _insert_run(run_id: str, sequence: int, started_at: str, content: str) -> None:
    repositories.llm_runs.create_run(
        run={
            "run_id": run_id,
            "task_id": f"task-{sequence}",
            "query_id": f"query-{sequence}",
            "sequence": sequence,
            "attempt": 1,
            "role": "reviewer",
            "provider": "openai",
            "model": "model-a",
            "temperature": 0.7,
            "prompt_sources": [],
            "input_messages": [{"role": "user", "content": content}],
            "tools": [],
            "started_at": started_at,
        }
    )
    repositories.llm_runs.finish_run(
        run_id=run_id,
        values={
            "status": "success",
            "completed_at": started_at,
            "duration_ms": 1,
            "output_message": {"content": f"reply-{content}"},
        },
    )


def test_call_logs_endpoint_returns_llm_runs_in_time_order(monkeypatch):
    monkeypatch.setattr(
        catalog_service,
        "refresh_models",
        lambda: {"ok": True, "models": [], "added": [], "removed": []},
    )
    _insert_run("run-older", 1, "2026-10-01T00:00:00+00:00", "older")
    _insert_run("run-newer", 2, "2026-10-01T00:00:01+00:00", "newer")

    with TestClient(app) as client:
        response = client.get("/llm/call-logs?limit=10")

    assert response.status_code == 200
    logs = response.json()["logs"]
    assert [json.loads(row["input_text"])[0]["content"] for row in logs] == ["newer", "older"]
    assert logs[0]["id"] == "run-newer"
    assert logs[0]["output_text"] == "reply-newer"
    assert logs[0]["status"] == "success"
    assert logs[0]["created_at"] == "2026-10-01T00:00:01+00:00"
