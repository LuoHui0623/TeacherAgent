"""API 依赖契约：共享服务经可覆盖依赖提供，路由不直接读取应用状态。"""

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.api.services import get_runtime
from teacheragent.infrastructure.llm.runtime import LlmRuntime


SETTINGS = {
    "role": "tutor",
    "provider": "override-provider",
    "model": "override-model",
    "temperature": 0.1,
}


def test_runtime_limits_read_and_write_go_through_the_overridden_service():
    runtime = LlmRuntime(default_limit=3)
    runtime.limiter_for(SETTINGS)
    app.dependency_overrides[get_runtime] = lambda: runtime
    try:
        with TestClient(app) as client:
            listed = client.get("/llm/runtime/limits")
            updated = client.put(
                "/llm/runtime/limits",
                json={
                    "provider": SETTINGS["provider"],
                    "model": SETTINGS["model"],
                    "limit": 5,
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert listed.status_code == 200
    (limit,) = listed.json()["limits"]
    assert limit["provider"] == "override-provider"
    assert limit["model"] == "override-model"
    assert limit["limit"] == 3

    assert updated.status_code == 200
    assert updated.json()["limit"] == 5
    assert runtime.limiter_stats()[0].limit == 5
