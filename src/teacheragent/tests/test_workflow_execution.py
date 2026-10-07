"""执行器契约：冻结图快照、单节点执行与事务提交、门禁挂起与决断、恢复、暂停、局部重跑。"""

import json
from datetime import UTC, datetime

import pytest

from teacheragent.infrastructure.store.sqlite.repositories import (
    node_artifacts as artifact_repo,
    node_runs as run_repo,
    workflow_snapshots as snapshot_repo,
)
from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.workflows import CONTENT_PIPELINE_WORKFLOW_ID
from teacheragent.workflows.errors import NodeExecutionError
from teacheragent.workflows.execution import (
    Artifact,
    NodeInstance,
    WorkflowExecutor,
)
from teacheragent.workflows.execution import store
from teacheragent.workflows.execution.contracts import NodeExecution
from teacheragent.workflows.execution.nodes import call_origin

WORKFLOW = CONTENT_PIPELINE_WORKFLOW_ID
RUN = "run-1"
BASE = datetime(2026, 10, 7, 9, 0, 0, tzinfo=UTC)


def _fake_node(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假节点正文：把身份写进去，方便断言归属。"""
    return {
        "node": execution.node.id,
        "item": execution.item_key,
        "inputs": sorted(execution.inputs),
        "run": origin.workflow_run_id,
    }


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
"""除大纲外都用同一个假实现，避免测试依赖真实模型。"""


def _executor(implementations: dict | None = None) -> WorkflowExecutor:
    return WorkflowExecutor(implementations=IMPLEMENTATIONS if implementations is None else implementations)


def _open(executor: WorkflowExecutor) -> str:
    return executor.open_run(
        workflow_id=WORKFLOW,
        run_id=RUN,
        trigger_message_id="msg-1",
        events=[{"type": "request", "occurredAt": BASE.isoformat(), "summary": "学 FastAPI"}],
        at=BASE,
    )


def _artifact_rows(*, node_id: str, item_key: str = "") -> list[dict]:
    return artifact_repo.list_artifacts(
        workflow_id=WORKFLOW, run_id=RUN, node_id=node_id, item_key=item_key or None
    )


def test_open_run_freezes_graph_and_writes_entry_artifact():
    graph_hash = _open(_executor())

    snapshot = snapshot_repo.get_snapshot(workflow_id=WORKFLOW, content_hash=graph_hash)
    assert snapshot is not None
    entry = run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="tutor-trigger")
    assert entry["status"] == "succeeded"
    assert entry["trigger_message_id"] == "msg-1"
    assert [row["port_id"] for row in _artifact_rows(node_id="tutor-trigger")] == ["events"]


def test_advance_stops_at_the_first_human_gate():
    executor = _executor()
    _open(executor)

    progress = executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert [instance.node_id for instance in progress.executed] == [
        "context-snapshot",
        "intent-planner",
    ]
    assert [instance.node_id for instance in progress.waiting] == ["brief-approval"]
    gate = run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval")
    assert gate["status"] == "waiting-human"


def test_decide_writes_its_own_review_and_releases_downstream():
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)
    reviewed = _artifact_rows(node_id="intent-planner")[0]["content_hash"]

    executor.decide(workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval", approved=True, at=BASE)

    reviews = _artifact_rows(node_id="brief-approval")
    assert [row["port_id"] for row in reviews] == ["approved"]
    payload = json.loads(reviews[0]["payload_json"])
    assert (payload["reviewer"], payload["decision"], payload["scopeType"]) == (
        "user",
        "approved",
        "workflow",
    )
    assert payload["contentHash"] == reviewed
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval"
    )["status"] == "succeeded"


def test_full_chain_reaches_the_publisher():
    executor = _executor()
    _open(executor)

    assert [i.node_id for i in executor.advance(workflow_id=WORKFLOW, run_id=RUN).waiting] == [
        "brief-approval"
    ]
    executor.decide(workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval", approved=True)
    assert [i.node_id for i in executor.advance(workflow_id=WORKFLOW, run_id=RUN).waiting] == [
        "outline-approval"
    ]
    executor.decide(workflow_id=WORKFLOW, run_id=RUN, node_id="outline-approval", approved=True)

    progress = executor.advance(workflow_id=WORKFLOW, run_id=RUN)
    assert [i.item_key for i in progress.waiting] == ["c1", "c2"]

    for chapter in ("c1", "c2"):
        executor.decide(
            workflow_id=WORKFLOW,
            run_id=RUN,
            node_id="chapter-approval",
            item_key=chapter,
            approved=True,
        )
    assert [i.node_id for i in executor.advance(workflow_id=WORKFLOW, run_id=RUN).waiting] == [
        "publish-approval"
    ]
    executor.decide(workflow_id=WORKFLOW, run_id=RUN, node_id="publish-approval", approved=True)

    progress = executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert [instance.node_id for instance in progress.executed] == ["publisher"]
    assert executor.advance(workflow_id=WORKFLOW, run_id=RUN).idle
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="publisher"
    )["status"] == "succeeded"
    drafts = artifact_repo.list_artifacts(
        workflow_id=WORKFLOW, run_id=RUN, node_id="chapter-writers"
    )
    assert sorted(row["item_key"] for row in drafts) == ["c1", "c2"]


def test_recover_reschedules_the_zombie_row_and_converges():
    executor = _executor()
    graph_hash = _open(executor)
    run_repo.upsert_run(
        workflow_id=WORKFLOW,
        run_id=RUN,
        node_id="context-snapshot",
        status="running",
        workflow_content_hash=graph_hash,
        item_key="",
        generation=0,
        attempt=1,
        at=BASE,
    )

    affected = executor.recover(workflow_id=WORKFLOW)

    assert affected == ((WORKFLOW, RUN),)
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="context-snapshot"
    )["status"] == "pending"
    assert executor.advance(workflow_id=WORKFLOW, run_id=RUN).executed


def test_pause_stops_before_running_and_resume_continues():
    executor = _executor()
    _open(executor)
    executor.pause(RUN)

    paused = executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert paused.paused
    assert paused.executed == ()
    assert run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="context-snapshot") is None

    executor.resume(RUN)
    assert executor.advance(workflow_id=WORKFLOW, run_id=RUN).executed


def test_rerun_only_moves_the_node_and_its_downstream():
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    affected = executor.rerun(workflow_id=WORKFLOW, run_id=RUN, node_id="intent-planner")

    assert NodeInstance("intent-planner") in affected
    assert NodeInstance("brief-approval") in affected
    assert NodeInstance("context-snapshot") not in affected
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="intent-planner", generation=1
    )["status"] == "pending"
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="context-snapshot", generation=0
    )["status"] == "succeeded"


def test_rerun_keeps_the_upstream_input_available():
    """重跑上游不动上游：新代次的节点仍然消费旧代次的产物。"""
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)
    executor.rerun(workflow_id=WORKFLOW, run_id=RUN, node_id="outline-architect")

    executor.decide(workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval", approved=True)
    progress = executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert NodeInstance("outline-architect") in progress.executed
    assert executor.is_paused(RUN) is False


def test_deciding_on_a_stale_version_is_rejected():
    """决断绑的是界面上看到的那一版；对不上就拒绝，不改动任何行。"""
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    with pytest.raises(NodeExecutionError):
        executor.decide(
            workflow_id=WORKFLOW,
            run_id=RUN,
            node_id="brief-approval",
            approved=True,
            expected_hash="sha256:stale",
        )

    gate = run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="brief-approval")
    assert gate["status"] == "waiting-human"
    assert _artifact_rows(node_id="brief-approval") == []


def test_call_origin_carries_the_node_instance_and_its_inputs():
    """调用身份 = 节点实例 + 读到的产物版本 + 节点声明的提示词。"""
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    graph_hash = store.run_graph_hash(workflow_id=WORKFLOW, run_id=RUN)
    definition = store.load_definition(workflow_id=WORKFLOW, graph_hash=graph_hash)
    execution = NodeExecution(
        definition=definition,
        node=definition.node("outline-architect"),
        run_id=RUN,
        item_key="c1",
        generation=1,
        inputs={
            "brief": (
                Artifact(
                    node_id="intent-planner",
                    port_id="brief",
                    item_key="",
                    generation=0,
                    content_hash="sha256:brief",
                    payload={},
                ),
            )
        },
    )

    origin = call_origin(execution)

    assert (
        origin.workflow_id,
        origin.workflow_run_id,
        origin.node_id,
        origin.item_key,
        origin.generation,
    ) == (WORKFLOW, RUN, "outline-architect", "c1", 1)
    assert origin.prompt_ref == "agent/prompts/outline-architect.md"
    assert origin.prompt_content_hash is not None
    assert origin.bindings["brief"][0]["content_hash"] == "sha256:brief"


def test_call_origin_skips_prompts_without_an_asset():
    """资产还没写的节点：只记下声明的路径，不替它报错也不臆造哈希。"""
    executor = _executor()
    _open(executor)
    executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    graph_hash = store.run_graph_hash(workflow_id=WORKFLOW, run_id=RUN)
    definition = store.load_definition(workflow_id=WORKFLOW, graph_hash=graph_hash)
    execution = NodeExecution(
        definition=definition,
        node=definition.node("intent-planner"),
        run_id=RUN,
        item_key="",
        generation=0,
    )

    origin = call_origin(execution)

    assert origin.prompt_ref == "agent/prompts/intent-planner.md"
    assert origin.prompt_content_hash is None
    assert origin.bindings == {}


def test_missing_implementation_fails_loud():
    executor = _executor(implementations={})
    _open(executor)

    progress = executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert [instance.node_id for instance in progress.failed] == ["intent-planner"]
    row = run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="intent-planner")
    assert row["status"] == "failed"
    assert "intent-planner" in row["error"]


def test_unserializable_payload_rolls_the_whole_write_back():
    """产物正文写不下来时，同一次执行的事实行也不该留下。"""
    executor = _executor(
        implementations={**IMPLEMENTATIONS, "intent-planner": lambda _execution, _origin: object()}
    )
    _open(executor)

    with pytest.raises(TypeError):
        executor.advance(workflow_id=WORKFLOW, run_id=RUN)

    assert run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="intent-planner") is None
