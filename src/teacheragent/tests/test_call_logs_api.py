"""API 契约：提示词地图读取调用时间流。"""

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.infrastructure.store import repositories
from teacheragent.services.llm import catalog as catalog_service


def test_call_logs_endpoint_returns_time_ordered_rows(monkeypatch):
    monkeypatch.setattr(
        catalog_service,
        "refresh_models",
        lambda: {"ok": True, "models": [], "added": [], "removed": []},
    )
    repositories.call_logs.insert_log(
        role="reviewer",
        provider="openai",
        model="model-a",
        input_text="older",
        output_text="first",
    )
    repositories.call_logs.insert_log(
        role="reviser",
        provider="openai",
        model="model-a",
        input_text="newer",
        output_text="second",
    )

    with TestClient(app) as client:
        response = client.get("/llm/call-logs?limit=10")

    assert response.status_code == 200
    assert [row["input_text"] for row in response.json()["logs"]] == ["older", "newer"]
    assert "prompt_ref" not in response.json()["logs"][0]
