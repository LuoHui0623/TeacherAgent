"""提示词地图读接口：pipeline 历史、节点摘要与三态阶段、模板漂移。"""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.capabilities.outline.messages import build_outline_messages
from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client as llm_client
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.llm.prompts import read_prompt
from teacheragent.infrastructure.store.sqlite.repositories import llm_runs as call_repo
from teacheragent.workflows import CONTENT_PIPELINE_WORKFLOW_ID
from teacheragent.workflows.content_pipeline.artifacts import LEARNING_BRIEF
from teacheragent.workflows.execution import WorkflowExecutor
from teacheragent.workflows.execution.contracts import NodeExecution

WORKFLOW = CONTENT_PIPELINE_WORKFLOW_ID
RUN = "run-1"
OUTLINE_NODE = "outline-architect"
OUTLINE_PROMPT_REF = "agent/prompts/outline-architect.md"
BASE = datetime(2026, 10, 7, 9, 0, 0, tzinfo=UTC)


def _fake_node(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假节点正文：把身份写进去，方便断言归属。"""
    return {"node": execution.node.id, "item": execution.item_key, "run": origin.workflow_run_id}


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


class _Response:
    """假模型返回，形状与真实 provider 一致。"""

    content = "answer"
    usage_metadata = {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5}


class _Model:
    def invoke(self, messages):
        return _Response()


def _open_run(*, advance: bool = True) -> None:
    """开一次运行；默认推进到第一个人工门禁前停下。"""
    executor = WorkflowExecutor(implementations=IMPLEMENTATIONS)
    executor.open_run(
        workflow_id=WORKFLOW,
        run_id=RUN,
        trigger_message_id="msg-1",
        events=[{"type": "request", "occurredAt": BASE.isoformat(), "summary": "学 FastAPI"}],
        at=BASE,
    )
    if advance:
        executor.advance(workflow_id=WORKFLOW, run_id=RUN)


def _origin(*, prompt_hash: str | None = None, status_hash: str | None = None) -> WorkflowCallOrigin:
    """大纲节点实例的调用身份；`status_hash` 用于造出模板漂移。"""
    return WorkflowCallOrigin(
        workflow_id=WORKFLOW,
        workflow_run_id=RUN,
        node_id=OUTLINE_NODE,
        generation=0,
        item_key="",
        prompt_ref=OUTLINE_PROMPT_REF,
        prompt_content_hash=prompt_hash or read_prompt(OUTLINE_PROMPT_REF).content_hash,
        bindings={
            "brief": [
                {
                    "node_id": "brief-approval",
                    "port_id": "brief",
                    "item_key": "",
                    "content_hash": status_hash or "sha256:brief",
                }
            ]
        },
    )


def _record_successful_call(origin: WorkflowCallOrigin, monkeypatch) -> None:
    """记一次真实走完整条渲染与记录链路的成功调用。"""
    monkeypatch.setattr(llm_client, "build_client", lambda _settings: _Model())
    messages = build_outline_messages(
        {"goal": "掌握 FastAPI"},
        StructuredProfile(version=3),
        prompt_ref=OUTLINE_PROMPT_REF,
    )
    invoke_llm(AgentRole.CURRICULUM, messages, origin=origin)


def _record_running_call(origin: WorkflowCallOrigin) -> None:
    """直接写一行仍在执行的调用；真实 recorder 会立刻收尾，这里要的是中间态。"""
    call_repo.create_run(
        run={
            "run_id": "11111111-1111-1111-1111-111111111111",
            "task_id": "22222222-2222-2222-2222-222222222222",
            "query_id": "33333333-3333-3333-3333-333333333333",
            "sequence": 1,
            "attempt": 1,
            "role": str(AgentRole.CURRICULUM),
            "provider": "openai",
            "model": "model-a",
            "temperature": 0.7,
            "prompt_sources": [
                {
                    "ref": OUTLINE_PROMPT_REF,
                    "content_hash": origin.prompt_content_hash,
                    "name": "outline-architect",
                    "order": 0,
                    "role": "system",
                    "template_text": "模板",
                    "rendered_text": "渲染结果",
                }
            ],
            "input_messages": [{"role": "system", "content": "hello"}],
            "tools": [],
            "started_at": BASE.isoformat(),
            "origin": origin,
        }
    )


def test_run_list_reports_status_window_and_graph_version():
    _open_run()

    with TestClient(app) as client:
        response = client.get(f"/workflows/{WORKFLOW}/runs")

    assert response.status_code == 200
    runs = response.json()["runs"]
    assert [run["runId"] for run in runs] == [RUN]
    assert runs[0]["workflowId"] == WORKFLOW
    assert runs[0]["status"] == "waiting-human"
    assert runs[0]["triggerMessageId"] == "msg-1"
    assert runs[0]["startedAt"] <= runs[0]["updatedAt"]
    assert runs[0]["durationMs"] >= 0
    assert runs[0]["graphContentHash"].startswith("sha256:")


def test_run_list_ignores_runs_of_other_workflows():
    """历史按路径里的流程取，不靠 run id 反查归属。"""
    _open_run()

    with TestClient(app) as client:
        response = client.get("/workflows/other-pipeline/runs")

    assert response.status_code == 200
    assert response.json()["runs"] == []


def test_run_detail_carries_the_frozen_graph_and_every_node():
    _open_run()

    with TestClient(app) as client:
        response = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["graph"]["id"] == WORKFLOW
    assert payload["graph"]["contentHash"] == payload["graphContentHash"]
    assert (len(payload["graph"]["nodes"]), len(payload["graph"]["edges"])) == (16, 25)
    nodes = {node["nodeId"]: node for node in payload["nodes"]}
    assert len(nodes) == 16
    assert nodes["tutor-trigger"]["status"] == "succeeded"
    assert nodes["brief-approval"]["status"] == "waiting-human"
    assert nodes["chapter-writers"]["status"] == "pending"
    assert nodes["intent-planner"]["outputs"][0]["type"] == LEARNING_BRIEF
    assert nodes["intent-planner"]["outputs"][0]["payload"]["node"] == "intent-planner"
    assert nodes["outline-architect"]["outputs"] == []
    assert nodes["brief-approval"]["inputs"][0]["portId"] == "brief"


def test_nodes_endpoint_lists_the_same_summaries():
    _open_run()

    with TestClient(app) as client:
        nodes = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes").json()["nodes"]
        detail = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}").json()["nodes"]

    assert nodes == detail


def test_prompt_map_of_a_pending_node_shows_the_unfilled_template():
    _open_run(advance=False)

    with TestClient(app) as client:
        response = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{OUTLINE_NODE}/prompt-map")

    assert response.status_code == 200
    payload = response.json()
    assert payload["nodeStatus"] == "pending"
    assert payload["promptRef"] == OUTLINE_PROMPT_REF
    assert payload["template"]["variables"] == ["brief", "learnerProfile"]
    assert payload["template"]["runHash"] is None
    assert payload["template"]["changed"] is False
    assert "${{ brief }}" in payload["template"]["template"]
    assert [binding["state"] for binding in payload["template"]["bindings"]] == ["pending", "pending"]

    assert [call["status"] for call in payload["calls"]] == ["pending"]
    assert payload["calls"][0]["callId"] is None
    stages = payload["calls"][0]["stages"]
    assert [stage["kind"] for stage in stages] == [
        "template",
        "sources",
        "context",
        "messages",
        "request",
        "output",
    ]
    assert [stage["state"] for stage in stages] == ["pending"] + ["pending"] * 5
    assert stages[0]["data"]["template"] == payload["template"]["template"]
    assert stages[1]["data"] is None


def test_prompt_map_of_a_finished_node_fills_every_stage(monkeypatch):
    _open_run()
    _record_successful_call(_origin(), monkeypatch)

    with TestClient(app) as client:
        response = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{OUTLINE_NODE}/prompt-map")

    assert response.status_code == 200
    payload = response.json()
    calls = payload["calls"]
    assert len(calls) == 1
    call = calls[0]
    assert call["status"] == "success"
    assert call["callId"] != ""
    assert [stage["state"] for stage in call["stages"]] == ["filled"] * 6

    stages = {stage["kind"]: stage for stage in call["stages"]}
    sources = stages["sources"]["data"]
    assert [source["order"] for source in sources] == [0, 1]
    assert {source["ref"] for source in sources} == {OUTLINE_PROMPT_REF}
    assert "# 教材大纲架构" in sources[0]["templateText"]
    assert "${{ brief }}" not in sources[0]["templateText"]
    assert "${{ brief }}" in sources[1]["templateText"]
    assert '"goal": "掌握 FastAPI"' in sources[1]["renderedText"]
    assert stages["context"]["data"][0]["contentHash"] == "sha256:brief"
    assert [message["role"] for message in stages["messages"]["data"]] == ["system", "user"]
    assert stages["request"]["data"]["model"]
    assert stages["output"]["data"]["message"]["content"] == "answer"
    assert stages["output"]["data"]["totalTokens"] == 5


def test_prompt_map_of_a_running_call_streams_the_output(monkeypatch):
    _open_run()
    _record_running_call(_origin())

    with TestClient(app) as client:
        response = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{OUTLINE_NODE}/prompt-map")

    call = response.json()["calls"][0]
    assert call["status"] == "running"
    assert [stage["state"] for stage in call["stages"]] == ["filled"] * 5 + ["streaming"]
    assert call["stages"][5]["data"] is None


def test_prompt_map_marks_template_drift_and_binds_variables(monkeypatch):
    _open_run()
    _record_running_call(_origin(prompt_hash="sha256:当时那一版"))

    with TestClient(app) as client:
        payload = client.get(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{OUTLINE_NODE}/prompt-map"
        ).json()

    template = payload["template"]
    assert template["changed"] is True
    assert template["runHash"] == "sha256:当时那一版"
    assert template["currentHash"] == read_prompt(OUTLINE_PROMPT_REF).content_hash
    bindings = {binding["name"]: binding for binding in template["bindings"]}
    assert bindings["brief"]["state"] == "bound"
    assert bindings["brief"]["portId"] == "brief"
    assert bindings["brief"]["contentHash"] == "sha256:brief"
    assert bindings["learnerProfile"]["state"] == "bound"
    assert bindings["learnerProfile"]["portId"] is None


def test_prompt_map_keeps_a_node_without_calls_empty():
    """没写过提示词资产、也没有调用的节点：没有模板也没有预期调用，输入输出照旧可读。"""
    _open_run()

    with TestClient(app) as client:
        payload = client.get(f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/brief-approval/prompt-map").json()

    assert payload["template"] is None
    assert payload["promptRef"] is None
    assert payload["calls"] == []
    assert payload["nodeStatus"] == "waiting-human"
    assert [item["portId"] for item in payload["inputs"]] == ["brief"]
    assert [item["nodeId"] for item in payload["inputs"]] == ["intent-planner"]


def test_unknown_run_and_node_report_404():
    _open_run()

    with TestClient(app) as client:
        missing_run = client.get(f"/workflows/{WORKFLOW}/runs/no-such-run")
        missing_node = client.get(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/no-such-node/prompt-map"
        )
        other_workflow = client.get(f"/workflows/other-pipeline/runs/{RUN}")

    assert missing_run.status_code == 404
    assert missing_node.status_code == 404
    assert other_workflow.status_code == 404


def test_llm_runs_of_a_node_map_back_to_its_calls(monkeypatch):
    """端到端：记下的调用按节点实例归组到地图上，消息阶段就是当时发出去的内容。"""
    _open_run()
    _record_successful_call(_origin(), monkeypatch)

    with TestClient(app) as client:
        payload = client.get(
            f"/workflows/{WORKFLOW}/runs/{RUN}/nodes/{OUTLINE_NODE}/prompt-map"
        ).json()

    call = payload["calls"][0]
    assert (call["sequence"], call["attempt"], call["itemKey"], call["generation"]) == (1, 1, "", 0)
    stages = {stage["kind"]: stage for stage in call["stages"]}
    assert stages["messages"]["data"][0]["content"].startswith("# 教材大纲架构")
    assert '"learnerProfile"' in stages["messages"]["data"][1]["content"]
    assert payload["nodeStatus"] == "pending"
