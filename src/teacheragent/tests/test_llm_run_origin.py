"""调用记录里的节点身份：带 workflow 的调用能按 node_id 归组，其余保持 NULL。"""

import json

from fastapi.testclient import TestClient

from teacheragent.api.main import app
from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.capabilities.outline.messages import build_outline_messages
from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm import client
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.infrastructure.store import repositories
from teacheragent.services.llm import catalog as catalog_service

OUTLINE_PROMPT_REF = "agent/prompts/outline-architect.md"
"""大纲节点在图定义里声明的提示词资产路径。"""

ORIGIN = WorkflowCallOrigin(
    workflow_id="content-pipeline-main",
    workflow_run_id="run-1",
    node_id="outline-architect",
    generation=0,
    item_key="c1",
    prompt_ref=OUTLINE_PROMPT_REF,
    prompt_content_hash="sha256:abc",
    bindings={
        "brief": [
            {
                "node_id": "intent-planner",
                "port_id": "brief",
                "item_key": "",
                "content_hash": "sha256:brief",
            }
        ]
    },
)


class _Response:
    content = "answer"
    usage_metadata = {"input_tokens": 2, "output_tokens": 3, "total_tokens": 5}


class _Model:
    def invoke(self, messages):
        return _Response()


def test_workflow_call_records_its_node_instance(monkeypatch):
    monkeypatch.setattr(client, "build_client", lambda _settings: _Model())

    invoke_llm(
        AgentRole.CURRICULUM,
        [{"role": "user", "content": "hello"}],
        origin=ORIGIN,
    )

    row = repositories.llm_runs.list_runs(role="curriculum")[0]
    assert (row["workflow_id"], row["workflow_run_id"], row["node_id"], row["item_key"]) == (
        "content-pipeline-main",
        "run-1",
        "outline-architect",
        "c1",
    )
    assert row["generation"] == 0
    assert row["prompt_ref"] == "agent/prompts/outline-architect.md"
    assert row["prompt_content_hash"] == "sha256:abc"
    assert json.loads(row["bindings_json"])["brief"][0]["content_hash"] == "sha256:brief"


def test_plain_call_leaves_identity_columns_null(monkeypatch):
    """Tutor 对话这类非 workflow 调用不带身份，也不该因此报错。"""
    monkeypatch.setattr(client, "build_client", lambda _settings: _Model())

    invoke_llm(AgentRole.TUTOR, [{"role": "user", "content": "hello"}])

    row = repositories.llm_runs.list_runs(role="tutor")[0]
    assert row["node_id"] is None
    assert row["prompt_ref"] is None
    assert row["bindings_json"] is None
    assert row["prompt_sources_json"] == "[]"


def test_prompt_asset_sources_are_recorded_with_the_call(monkeypatch):
    """模板改由绑定表渲染后，调用记录里带上了资产来源、模板与渲染结果。"""
    monkeypatch.setattr(client, "build_client", lambda _settings: _Model())

    messages = build_outline_messages(
        {"goal": "掌握装饰器"},
        StructuredProfile(version=3),
        prompt_ref=OUTLINE_PROMPT_REF,
    )
    invoke_llm(AgentRole.CURRICULUM, messages, origin=ORIGIN)

    sources = json.loads(repositories.llm_runs.list_runs(role="curriculum")[0]["prompt_sources_json"])
    assert [source["role"] for source in sources] == ["system", "user"]
    assert {source["ref"] for source in sources} == {OUTLINE_PROMPT_REF}
    assert sources[0]["name"] == "outline-architect"
    assert sources[0]["content_hash"] == messages.sources[0].content_hash
    assert "${{ brief }}" in sources[1]["template_text"]
    assert '"goal": "掌握装饰器"' in sources[1]["rendered_text"]
    assert "${{ " not in sources[0]["rendered_text"]
    assert "${{ " not in sources[1]["rendered_text"]


def test_call_logs_expose_node_identity_and_prompt_sources(monkeypatch):
    monkeypatch.setattr(catalog_service, "refresh_models", lambda: {"models": []})
    repositories.llm_runs.create_run(
        run={
            "run_id": "00000000-0000-0000-0000-000000000011",
            "task_id": "00000000-0000-0000-0000-000000000012",
            "query_id": "00000000-0000-0000-0000-000000000013",
            "sequence": 1,
            "attempt": 1,
            "role": "curriculum",
            "provider": "openai",
            "model": "model-a",
            "temperature": 0.7,
            "prompt_sources": [{"ref": "agent/prompts/outline-architect.md"}],
            "input_messages": [{"role": "user", "content": "hello"}],
            "tools": [],
            "started_at": "2026-10-01T00:00:00+00:00",
            "origin": ORIGIN,
        }
    )

    with TestClient(app) as test_client:
        response = test_client.get("/llm/call-logs")

    call = response.json()["logs"][0]
    assert call["node_id"] == "outline-architect"
    assert call["prompt_sources"] == [{"ref": "agent/prompts/outline-architect.md"}]
