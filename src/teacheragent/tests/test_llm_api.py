"""API 契约：模型目录、角色 Profile 增删改查与切换。"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.api.routes import llm as llm_routes
from teacheragent.infrastructure.llm import catalog, settings
from teacheragent.services.llm import base_agent
from teacheragent.services.llm import catalog as catalog_service


FAKE_RESPONSE = {
    "object": "list",
    "data": [{"id": "model-a"}, {"id": "model-b"}],
}


@pytest.fixture
def api(monkeypatch):
    """启动 API，并注入稳定的模型目录响应。"""
    catalog.reset_catalog()

    def refresh():
        return catalog.refresh_models(lambda: FAKE_RESPONSE)

    monkeypatch.setattr(catalog_service, "refresh_models", refresh)
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def _fresh_catalog():
    catalog.reset_catalog()
    yield
    catalog.reset_catalog()


def test_models_endpoint_returns_runtime_catalog(api):
    assert api.get("/llm/models").json() == {"models": ["model-a", "model-b"]}


def test_preflight_is_allowed_for_local_frontend(api):
    response = api.options(
        "/llm/models/refresh",
        headers={
            "Origin": "http://localhost:3055",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3055"


def test_model_refresh_updates_catalog(api, monkeypatch):
    def refresh():
        return catalog.refresh_models(lambda: {"object": "list", "data": [{"id": "model-b"}]})

    monkeypatch.setattr(catalog_service, "refresh_models", refresh)

    response = api.post("/llm/models/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["added"] == []
    assert body["removed"] == ["model-a"]
    assert body["models"] == ["model-b"]


def test_model_refresh_failure_keeps_previous_catalog(api, monkeypatch):
    def refresh():
        return catalog.refresh_models(
            lambda: (_ for _ in ()).throw(ValueError("模型列表为空"))
        )

    monkeypatch.setattr(catalog_service, "refresh_models", refresh)

    response = api.post("/llm/models/refresh")

    assert response.status_code == 200
    assert response.json()["error_type"] == "invalid_response"
    assert api.get("/llm/models").json() == {"models": ["model-a", "model-b"]}


def test_profile_create_list_update_activate_and_delete(api):
    created = api.post(
        "/llm/roles/teacher/profiles",
        json={"profile_id": "fast", "model": "model-a", "temperature": 0.2},
    )
    assert created.status_code == 200
    assert created.json()["profile_id"] == "fast"

    activated = api.post("/llm/roles/teacher/profiles/fast/activate")
    assert activated.status_code == 200
    assert activated.json()["active"] == 1

    updated = api.put(
        "/llm/roles/teacher/profiles/fast",
        json={"model": "model-b", "temperature": 0.4},
    )
    assert updated.status_code == 200
    assert updated.json()["model"] == "model-b"
    assert updated.json()["temperature"] == 0.4
    assert updated.json()["active"] == 1

    roles = api.get("/llm/roles/teacher/profiles").json()
    profile = next(item for item in roles["profiles"] if item["profile_id"] == "fast")
    assert profile["valid"] == 1

    deleted = api.delete("/llm/roles/teacher/profiles/fast")
    assert deleted.status_code == 400


def test_duplicate_profile_is_rejected(api):
    api.post(
        "/llm/roles/teacher/profiles",
        json={"profile_id": "fast", "model": "model-a", "temperature": 0.2},
    )

    response = api.post(
        "/llm/roles/teacher/profiles",
        json={"profile_id": "fast", "model": "model-b", "temperature": 0.3},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Profile 已存在：fast"


def test_unknown_model_or_role_is_rejected(api):
    unknown_model = api.post(
        "/llm/roles/teacher/profiles",
        json={"profile_id": "broken", "model": "missing", "temperature": 0.2},
    )
    unknown_role = api.post(
        "/llm/roles/no-such-role/profiles",
        json={"profile_id": "fast", "model": "model-a", "temperature": 0.2},
    )

    assert unknown_model.status_code == 400
    assert "模型不在当前目录中" in unknown_model.json()["detail"]
    assert unknown_role.status_code == 400
    assert "未知角色" in unknown_role.json()["detail"]


def test_profiles_are_isolated_by_role_and_active_is_immediate(api):
    api.post(
        "/llm/roles/teacher/profiles",
        json={"profile_id": "fast", "model": "model-a", "temperature": 0.1},
    )
    api.post(
        "/llm/roles/curriculum/profiles",
        json={"profile_id": "fast", "model": "model-b", "temperature": 0.9},
    )
    api.post("/llm/roles/teacher/profiles/fast/activate")
    api.post("/llm/roles/curriculum/profiles/fast/activate")

    assert settings.get_settings("teacher")["temperature"] == 0.1
    assert settings.get_settings("curriculum")["temperature"] == 0.9


def test_invoke_endpoint_uses_requested_role(api, monkeypatch):
    captured: list[str] = []

    class _FakeAgent:
        def __init__(self, role):
            captured.append(str(role))

        def invoke(self, messages):
            return SimpleNamespace(content="pong")

    monkeypatch.setattr(base_agent, "BaseAgent", _FakeAgent)

    response = api.post(
        "/llm/invoke",
        json={"role": "teacher", "messages": [{"role": "user", "content": "ping"}]},
    )

    assert response.status_code == 200
    assert response.json() == {"role": "teacher", "content": "pong"}
    assert captured == ["teacher"]
