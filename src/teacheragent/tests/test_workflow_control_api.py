"""运行控制接口：暂停 / 继续 / 局部重跑 / 人工决断。

控制动作落在进程级执行器上：暂停标记是它的内存状态（口径 26，不落库），重跑与决断写进库
并立刻推进一次。因此「暂停后继续能接着跑」「重跑只动该节点及下游」都能在这里验证。
"""

import pytest
from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.api.services import AppServices
from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.workflows import CONTENT_PIPELINE_WORKFLOW_ID
from teacheragent.workflows.execution import WorkflowExecutor
from teacheragent.workflows.execution.contracts import NodeExecution
from teacheragent.infrastructure.store.sqlite.repositories import (
    node_artifacts as artifact_repo,
    node_runs as run_repo,
)

WORKFLOW = CONTENT_PIPELINE_WORKFLOW_ID
RUN = "run-1"
BASE = "2026-10-07T09:00:00+00:00"


def _fake_node(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假节点正文：带节点与条目身份，便于断言归属与代次。"""
    return {"node": execution.node.id, "item": execution.item_key, "generation": execution.generation}


def _fake_outline(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假大纲：两章，供 fan-out 展开。"""
    return {
        "id": "outline-1",
        "title": "假大纲",
        "coveredOutcomeIds": [],
        "items": [{"id": "c1", "title": "第一章"}, {"id": "c2", "title": "第二章"}],
    }


IMPLEMENTATIONS = {
    "intent-planner": _fake_node,
    "outline-architect": _fake_outline,
    "chapter-writer": _fake_node,
    "reviewer": _fake_node,
    "reviser": _fake_node,
    "beautifier": _fake_node,
    "assessment-generator": _fake_node,
}


def _executor_with_fakes(client: TestClient) -> WorkflowExecutor:
    """把共享执行器的实现表换成假实现 —— 测试不依赖真实模型。"""
    services = app.state.services
    executor = WorkflowExecutor(implementations=IMPLEMENTATIONS)
    app.state.services = AppServices(
        llm_runtime=services.llm_runtime,
        workflow_executor=executor,
    )
    return executor


def _open_run(executor: WorkflowExecutor) -> None:
    """开一次运行并推进到第一个人工门禁。"""
    executor.open_run(
        workflow_id=WORKFLOW,
        run_id=RUN,
        trigger_message_id="msg-1",
        events=[{"type": "request", "occurredAt": BASE}],
    )
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)


def _waiting_node(client: TestClient) -> str:
    """当前停在哪个门禁。"""
    detail = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}").json()
    return next(node for node in detail["nodes"] if node["status"] == "waiting-human")["nodeId"]


def test_pause_stops_advancing_and_resume_continues():
    with TestClient(app) as client:
        executor = _executor_with_fakes(client)
        _open_run(executor)
        gate = _waiting_node(client)

        paused = client.post(f"/workflows/{WORKFLOW}/runs/{RUN}/pause")
        assert paused.status_code == 200
        assert paused.json() == {"runId": RUN, "paused": True}
        assert executor.is_paused(RUN)

        # 暂停期间推进不动：这是内存行为，库里状态不变。
        before = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN)
        assert executor.advance(workflow_id=WORKFLOW, run_id=RUN).paused is True
        assert run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN) == before

        # 决断后继续：去掉暂停标记并接着推进。
        reviewed = client.get(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/prompt-map"
        ).json()["inputs"][0]["contentHash"]
        decided = client.post(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/decide",
            json={"approved": True, "comments": "通过", "expectedHash": reviewed},
        )
        assert decided.status_code == 200
        assert decided.json()["paused"] is True

        resumed = client.post(f"/workflows/{WORKFLOW}/runs/{RUN}/resume")
        assert resumed.status_code == 200
        assert resumed.json()["paused"] is False
        assert [item["nodeId"] for item in resumed.json()["executed"]]
        assert executor.is_paused(RUN) is False


def test_decide_writes_its_own_review_and_releases_downstream():
    with TestClient(app) as client:
        executor = _executor_with_fakes(client)
        _open_run(executor)
        gate = _waiting_node(client)
        reviewed = client.get(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/prompt-map"
        ).json()["inputs"][0]["contentHash"]

        response = client.post(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/decide",
            json={"approved": True, "comments": "范围可以", "expectedHash": reviewed},
        )

    assert response.status_code == 200
    reviews = [
        row
        for row in artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN, node_id=gate)
        if row["port_id"] == "approved"
    ]
    assert len(reviews) == 1
    payload = reviews[0]["payload_json"]
    assert '"decision": "approved"' in payload
    assert '"comments": "范围可以"' in payload
    assert reviewed in payload


def test_deciding_on_a_stale_version_is_rejected_and_changes_nothing():
    with TestClient(app) as client:
        executor = _executor_with_fakes(client)
        _open_run(executor)
        gate = _waiting_node(client)
        before = artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN)

        response = client.post(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/decide",
            json={"approved": True, "expectedHash": "sha256:不是这一版"},
        )

    assert response.status_code == 409
    assert artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN) == before


def test_rerun_moves_that_node_and_its_downstream_to_a_new_generation():
    with TestClient(app) as client:
        executor = _executor_with_fakes(client)
        _open_run(executor)
        gate = _waiting_node(client)
        before = artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN)

        response = client.post(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{gate}/rerun",
        )

    assert response.status_code == 200
    affected = [item["nodeId"] for item in response.json()["affected"]]
    # 门禁的否决端口连回意向规划（反馈边），所以下游包含它；入口与上下文节点在它上游。
    assert gate in affected
    assert "intent-planner" in affected
    assert "context-snapshot" not in affected

    rows = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN)
    assert {row["generation"] for row in rows if row["node_id"] == gate} == {0, 1}
    assert {row["generation"] for row in rows if row["node_id"] == "context-snapshot"} == {0}
    # 旧代次的行留在库里可读：重跑是追加，不是覆盖。
    before_keys = {(row["node_id"], row["port_id"], row["generation"]) for row in before}
    after_keys = {
        (row["node_id"], row["port_id"], row["generation"])
        for row in artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN)
    }
    assert before_keys <= after_keys


def test_rerun_rejects_a_node_outside_the_graph():
    with TestClient(app) as client:
        _executor_with_fakes(client)
        _open_run(_executor_with_fakes(client))

        response = client.post(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/no-such-node/rerun")

    assert response.status_code == 404


def test_unknown_run_reports_404():
    with TestClient(app) as client:
        _executor_with_fakes(client)
        missing_run = client.post(f"/workflows/{WORKFLOW}/runs/no-such-run/pause")

    assert missing_run.status_code == 404


def test_startup_recovery_reschedules_interrupted_rows():
    """启动扫描把 `running` 的僵尸行放回 `pending` 并接着推进，进程退出不留死行。"""
    with TestClient(app) as client:
        executor = _executor_with_fakes(client)
        _open_run(executor)
        graph_hash = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN)[0]["workflow_content_hash"]
        run_repo.upsert_run(
            workflow_id=WORKFLOW,
            run_id=RUN,
            node_id="context-snapshot",
            status="running",
            workflow_content_hash=graph_hash,
        )
        assert run_repo.get_run(
            workflow_id=WORKFLOW, run_id=RUN, node_id="context-snapshot"
        )["status"] == "running"

    # 重启：lifespan 里做恢复扫描，僵尸行被重新调度并收敛到终态。
    with TestClient(app):
        row = run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="context-snapshot")

    assert row is not None
    assert row["status"] == "succeeded"
