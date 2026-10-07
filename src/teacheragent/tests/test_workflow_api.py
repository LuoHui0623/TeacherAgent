"""工作流图定义读接口：列表摘要、单图完整定义、未知 id 404、前端夹具一致性。"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.workflows import CONTENT_PIPELINE_WORKFLOW_ID, main_workflow_definition

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "tests"
    / "fixtures"
    / "workflows.json"
)
"""前端测试用的接口响应夹具；前端不再持有自己的图定义副本。"""


def test_list_returns_registered_workflow_summary():
    with TestClient(app) as client:
        response = client.get("/workflows")

    assert response.status_code == 200
    items = response.json()["workflows"]
    assert [item["id"] for item in items] == [CONTENT_PIPELINE_WORKFLOW_ID]
    assert items[0]["nodeCount"] == len(main_workflow_definition.nodes)
    assert items[0]["edgeCount"] == len(main_workflow_definition.edges)
    assert items[0]["contentHash"].startswith("sha256:")


def test_get_workflow_returns_the_registered_definition_verbatim():
    with TestClient(app) as client:
        response = client.get(f"/workflows/{CONTENT_PIPELINE_WORKFLOW_ID}")

    assert response.status_code == 200
    payload = response.json()
    expected = main_workflow_definition.to_payload()
    assert {key: payload[key] for key in expected} == expected
    assert payload["version"] == main_workflow_definition.version
    assert payload["contentHash"].startswith("sha256:")
    assert (len(payload["nodes"]), len(payload["edges"])) == (16, 25)


def test_unknown_workflow_reports_404():
    with TestClient(app) as client:
        response = client.get("/workflows/no-such-workflow")

    assert response.status_code == 404


def test_frontend_fixture_matches_the_api_response():
    """前端夹具是接口响应的快照，漂移时在这里失败。

    重建：`uv run python scripts/export_workflow_fixtures.py`。
    """
    with TestClient(app) as client:
        response = client.get(f"/workflows/{CONTENT_PIPELINE_WORKFLOW_ID}")

    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert fixture == response.json(), (
        "前端夹具与接口响应不一致，请跑 uv run python scripts/export_workflow_fixtures.py"
    )
