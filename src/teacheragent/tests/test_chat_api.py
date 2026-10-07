"""对话接口与发起路径。

对话是一串只追加的事实：写接口分配编号，读接口按时间升序给回；一轮 Tutor 对话把用户
发言与回复都落库，模型输入取整段对话。发起只认 `proposal` 消息，run 与它通过
`node_runs.trigger_message_id` 相互回指 —— 这两条就是 T8 的验收。
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.api.routes import chat as chat_routes
from teacheragent.api.services import AppServices
from teacheragent.constants import (
    ASSISTANT_ROLE,
    CHAT_TYPE,
    MESSAGE_TYPES,
    PROPOSAL_TYPE,
    ROLES,
    USER_ROLE,
)
from teacheragent.infrastructure.store.sqlite.repositories import chat_messages as message_repo
from teacheragent.services import chat
from teacheragent.services.llm import base_agent
from teacheragent.workflows import CONTENT_PIPELINE_WORKFLOW_ID
from teacheragent.workflows.execution import WorkflowExecutor
from teacheragent.workflows.execution.contracts import NodeExecution
from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin

WORKFLOW = CONTENT_PIPELINE_WORKFLOW_ID


def _fake_node(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假节点正文：测试不依赖真实模型。"""
    return {"node": execution.node.id, "item": execution.item_key, "generation": execution.generation}


def _fake_outline(execution: NodeExecution, origin: WorkflowCallOrigin):
    """假大纲：两章，供 fan-out 展开。"""
    return {
        "id": "outline-1",
        "title": "假大纲",
        "coveredOutcomeIds": [],
        "items": [{"id": "c1", "title": "第一章"}],
    }


def _executor_with_fakes() -> WorkflowExecutor:
    """把共享执行器的实现表换成假实现。"""
    services = app.state.services
    executor = WorkflowExecutor(
        implementations={
            "intent-planner": _fake_node,
            "outline-architect": _fake_outline,
            "chapter-writer": _fake_node,
        }
    )
    app.state.services = AppServices(
        llm_runtime=services.llm_runtime,
        workflow_executor=executor,
    )
    return executor


class _RecordingAgent:
    """记录模型收到的消息序列，便于断言「历史进了模型输入」。"""

    calls: list[list[dict[str, str]]] = []

    def __init__(self, role) -> None:
        self.role = role

    def invoke(self, messages, **kwargs):
        _RecordingAgent.calls.append(messages)
        return SimpleNamespace(content=f"回复 {len(_RecordingAgent.calls)}")


def _proposal(client: TestClient, content: str = "帮我做一份前端性能优化教材") -> str:
    """写一条 proposal 消息并返回它的 id。"""
    response = client.post(
        "/chat/messages",
        json={"role": USER_ROLE, "type": PROPOSAL_TYPE, "content": content},
    )
    assert response.status_code == 201
    return response.json()["messageId"]


def test_written_messages_read_back_in_order():
    with TestClient(app) as client:
        first = client.post("/chat/messages", json={"role": USER_ROLE, "content": "我开始学性能优化"})
        second = client.post(
            "/chat/messages",
            json={"role": ASSISTANT_ROLE, "content": "先从测量开始", "type": CHAT_TYPE},
        )

        listed = client.get("/chat/messages").json()["messages"]

    assert first.status_code == 201
    assert first.json()["type"] == CHAT_TYPE
    assert [row["messageId"] for row in listed] == ["msg-1", "msg-2"]
    assert [row["role"] for row in listed] == [USER_ROLE, ASSISTANT_ROLE]
    assert [row["content"] for row in listed] == ["我开始学性能优化", "先从测量开始"]
    assert listed[0]["eventTime"]


def test_read_limit_keeps_the_newest_messages():
    with TestClient(app) as client:
        for index in range(3):
            client.post("/chat/messages", json={"role": USER_ROLE, "content": f"第 {index} 条"})

        listed = client.get("/chat/messages", params={"limit": 2}).json()["messages"]

    assert [row["messageId"] for row in listed] == ["msg-2", "msg-3"]


def test_write_rejects_values_outside_the_vocabulary():
    with TestClient(app) as client:
        blank = client.post("/chat/messages", json={"role": USER_ROLE, "content": "  "})
        empty = client.post("/chat/messages", json={"role": USER_ROLE, "content": ""})
        unknown_role = client.post("/chat/messages", json={"role": "system", "content": "x"})
        unknown_type = client.post("/chat/messages", json={"role": USER_ROLE, "content": "x", "type": "note"})

        stored = client.get("/chat/messages").json()["messages"]

    # 空正文与词表外的取值都是请求不成立（422）；只有空白字符由服务层判为空（400）。
    assert [blank.status_code, empty.status_code, unknown_role.status_code, unknown_type.status_code] == [
        400,
        422,
        422,
        422,
    ]
    assert stored == []


def test_route_vocabulary_matches_constants():
    """接口词表与常量词表必须同步，否则写接口会拒掉库里允许的取值。"""
    assert set(chat_routes.MessageRole.__args__) == set(ROLES)
    assert set(chat_routes.MessageType.__args__) == set(MESSAGE_TYPES)


def test_tutor_turn_persists_both_sides_and_feeds_history(monkeypatch):
    _RecordingAgent.calls = []
    monkeypatch.setattr(base_agent, "BaseAgent", _RecordingAgent)

    with TestClient(app) as client:
        first = client.post("/chat/turns", json={"content": "什么是 LCP？"})
        second = client.post("/chat/turns", json={"content": "那 CLS 呢？"})
        listed = client.get("/chat/messages").json()["messages"]

    assert first.status_code == 201
    assert first.json()["user"]["role"] == USER_ROLE
    assert first.json()["assistant"]["role"] == ASSISTANT_ROLE
    assert [row["content"] for row in listed] == [
        "什么是 LCP？",
        "回复 1",
        "那 CLS 呢？",
        "回复 2",
    ]
    # 第二轮把第一轮的来回带进模型输入。
    assert _RecordingAgent.calls[1] == [
        {"role": USER_ROLE, "content": "什么是 LCP？"},
        {"role": ASSISTANT_ROLE, "content": "回复 1"},
        {"role": USER_ROLE, "content": "那 CLS 呢？"},
    ]


def test_turn_keeps_user_message_when_the_model_fails(monkeypatch):
    class _BrokenAgent:
        def __init__(self, role) -> None:
            self.role = role

        def invoke(self, messages, **kwargs):
            raise RuntimeError("provider down")

    monkeypatch.setattr(base_agent, "BaseAgent", _BrokenAgent)

    with TestClient(app) as client:
        response = client.post("/chat/turns", json={"content": "在吗？"})
        listed = client.get("/chat/messages").json()["messages"]

    assert response.status_code == 502
    assert [row["content"] for row in listed] == ["在吗？"]
    assert listed[0]["role"] == USER_ROLE


def test_start_run_needs_an_existing_proposal_message():
    with TestClient(app) as client:
        _executor_with_fakes()
        written = client.post("/chat/messages", json={"role": USER_ROLE, "content": "随便聊聊"})
        chat_message_id = written.json()["messageId"]

        missing = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": "msg-404"})
        not_proposal = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": chat_message_id})
        unknown_workflow = client.post(
            "/workflows/nope/runs",
            json={"messageId": _proposal(client)},
        )
        runs = client.get(f"/workflows/{WORKFLOW}/runs").json()["runs"]

    assert missing.status_code == 404
    assert not_proposal.status_code == 400
    assert PROPOSAL_TYPE in not_proposal.json()["detail"]
    assert unknown_workflow.status_code == 404
    assert runs == []


def test_proposal_starts_a_run_that_points_back_to_the_message(monkeypatch):
    monkeypatch.setattr(base_agent, "BaseAgent", _RecordingAgent)

    with TestClient(app) as client:
        _executor_with_fakes()
        message_id = _proposal(client)

        started = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": message_id})
        detail = client.get(f"/workflows/{WORKFLOW}/runs/{started.json()['runId']}").json()
        history = client.get(f"/workflows/{WORKFLOW}/runs").json()["runs"]

    assert started.status_code == 201
    assert started.json()["runId"] == "run-1"
    assert started.json()["messageId"] == message_id
    assert started.json()["graphContentHash"] == detail["graphContentHash"]
    # run 能回指到那条 proposal：历史里带的就是同一个消息 id。
    assert detail["triggerMessageId"] == message_id
    assert [run["triggerMessageId"] for run in history] == [message_id]


def test_entry_node_captures_the_proposal_as_its_event():
    with TestClient(app) as client:
        _executor_with_fakes()
        message_id = _proposal(client, content="帮我做一份线性代数教材")

        started = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": message_id})
        entry = client.get(
            f"/workflows/{WORKFLOW}/runs/{started.json()['runId']}/nodes/tutor-trigger/prompt-map"
        ).json()
        payload = entry["outputs"][0]["payload"]

    assert payload["events"][0]["messageId"] == message_id
    assert payload["events"][0]["content"] == "帮我做一份线性代数教材"
    assert payload["events"][0]["type"] == PROPOSAL_TYPE


def test_each_run_gets_the_next_id():
    with TestClient(app) as client:
        _executor_with_fakes()
        first = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": _proposal(client)})
        second = client.post(f"/workflows/{WORKFLOW}/runs", json={"messageId": _proposal(client)})
        history = client.get(f"/workflows/{WORKFLOW}/runs").json()["runs"]

    assert first.json()["runId"] == "run-1"
    assert second.json()["runId"] == "run-2"
    assert sorted(run["runId"] for run in history) == ["run-1", "run-2"]


def test_run_ids_ignore_foreign_suffixes():
    """编号只认自己的前缀与合法序号，库里出现别的 id 不影响续号。"""
    message_repo.add_message(message_id="msg-manual", role=USER_ROLE, type=CHAT_TYPE, content="手写")
    assert chat.append_message(role=USER_ROLE, type=CHAT_TYPE, content="下一条")["message_id"] == "msg-1"


@pytest.mark.parametrize("message_type", MESSAGE_TYPES)
def test_append_message_stores_the_asked_type(message_type):
    row = chat.append_message(role=ASSISTANT_ROLE, type=message_type, content="正文")
    assert row["type"] == message_type
    assert row["role"] == ASSISTANT_ROLE
