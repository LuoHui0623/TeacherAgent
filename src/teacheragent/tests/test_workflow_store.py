"""workflow 运行落库的仓储契约：内容寻址、幂等键、同键覆盖、对话顺序。"""

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from teacheragent.infrastructure.store.sqlite.repositories import (
    chat_messages as chat_repo,
    node_artifacts as artifact_repo,
    node_runs as run_repo,
    prompt_snapshots as prompt_repo,
    workflow_snapshots as snapshot_repo,
)

WORKFLOW = "content-pipeline-main"
RUN = "run-1"
BASE = datetime(2026, 10, 7, 9, 0, 0, tzinfo=UTC)


def _at(seconds: int = 0) -> datetime:
    return BASE + timedelta(seconds=seconds)


def _save_snapshot(content_hash: str = "sha256:graph-1", seconds: int = 0):
    return snapshot_repo.save_snapshot(
        workflow_id=WORKFLOW,
        content_hash=content_hash,
        snapshot={"workflowId": WORKFLOW, "contentHash": content_hash, "version": 1},
        at=_at(seconds),
    )


def _save_prompt(content: str, content_hash: str, seconds: int = 0):
    return prompt_repo.save_snapshot(
        ref="agent/prompts/outline-architect.md",
        content_hash=content_hash,
        content=content,
        at=_at(seconds),
    )


def _upsert_run(**overrides):
    fields = {
        "workflow_id": WORKFLOW,
        "run_id": RUN,
        "node_id": "reviewer",
        "status": "pending",
        "workflow_content_hash": "sha256:graph-1",
        "trigger_message_id": "msg-1",
        "at": BASE,
    }
    fields.update(overrides)
    return run_repo.upsert_run(**fields)


def _save_artifact(
    payload: dict,
    content_hash: str,
    port_id: str = "outline",
    generation: int = 0,
    seconds: int = 0,
):
    return artifact_repo.save_artifact(
        workflow_id=WORKFLOW,
        run_id=RUN,
        node_id="reviewer",
        port_id=port_id,
        payload=payload,
        content_hash=content_hash,
        generation=generation,
        at=_at(seconds),
    )


# ── 图快照：内容寻址，冻结两次同一版图不产生第二行 ──────────────────────────


def test_frozen_graph_is_content_addressed():
    first = _save_snapshot()
    again = _save_snapshot(seconds=3600)

    assert again["add_time"] == first["add_time"]
    assert snapshot_repo.list_snapshots(workflow_id=WORKFLOW) == [first]


def test_graph_versions_are_listed_in_append_order():
    _save_snapshot("sha256:graph-1")
    _save_snapshot("sha256:graph-2", seconds=1)

    hashes = [row["content_hash"] for row in snapshot_repo.list_snapshots(workflow_id=WORKFLOW)]
    assert hashes == ["sha256:graph-1", "sha256:graph-2"]
    assert snapshot_repo.get_snapshot(workflow_id=WORKFLOW, content_hash="sha256:graph-1") is not None
    assert snapshot_repo.get_snapshot(workflow_id=WORKFLOW, content_hash="sha256:missing") is None


# ── 提示词快照：按 ref 形成版本序列 ────────────────────────────────────────


def test_prompt_versions_are_listed_in_append_order():
    _save_prompt("第一版", "sha256:p1")
    _save_prompt("第二版", "sha256:p2", seconds=1)
    _save_prompt("第二版", "sha256:p2", seconds=7200)

    rows = prompt_repo.list_snapshots(ref="agent/prompts/outline-architect.md")
    assert [row["content"] for row in rows] == ["第一版", "第二版"]
    assert prompt_repo.get_snapshot(
        ref="agent/prompts/outline-architect.md", content_hash="sha256:p1"
    )["content"] == "第一版"


# ── 节点执行：幂等键就是主键，状态推进更新同一行 ────────────────────────────


def test_run_row_is_created_then_advanced_in_place():
    _upsert_run()
    advanced = _upsert_run(status="running", attempt=1, at=_at(5))

    rows = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN)
    assert len(rows) == 1
    assert advanced["status"] == "running"
    assert advanced["attempt"] == 1
    assert advanced["event_time"] == _at(5).isoformat()
    assert run_repo.get_run(workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer") == advanced


def test_run_level_columns_are_written_once():
    """图版本与触发消息是 run 的身份，状态推进不该改写它们。"""
    _upsert_run()
    advanced = _upsert_run(
        status="succeeded", trigger_message_id=None, workflow_content_hash="sha256:other", at=_at(5)
    )

    assert advanced["trigger_message_id"] == "msg-1"
    assert advanced["workflow_content_hash"] == "sha256:graph-1"


def test_fan_out_items_are_separate_rows():
    _upsert_run(node_id="chapter-writers", item_key="chapter-01")
    _upsert_run(node_id="chapter-writers", item_key="chapter-02")

    rows = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN)
    assert [row["item_key"] for row in rows] == ["chapter-01", "chapter-02"]
    assert run_repo.get_run(
        workflow_id=WORKFLOW, run_id=RUN, node_id="chapter-writers", item_key="chapter-02"
    )["item_key"] == "chapter-02"


def test_unfinished_filter_selects_restart_candidates():
    _upsert_run(node_id="tutor-trigger", status="succeeded")
    _upsert_run(node_id="reviewer", status="waiting-human")

    assert run_repo.list_runs(statuses=["pending", "running"]) == []
    assert [row["node_id"] for row in run_repo.list_runs(statuses=["waiting-human"])] == ["reviewer"]
    assert run_repo.list_runs(statuses=[]) == []


def test_run_listing_is_limited_and_ordered():
    _upsert_run(node_id="reviewer", at=_at(3))
    _upsert_run(node_id="tutor-trigger", at=_at(1))

    rows = run_repo.list_runs(workflow_id=WORKFLOW, run_id=RUN, limit=1)
    assert [row["node_id"] for row in rows] == ["tutor-trigger"]


# ── 产物：一次执行多个端口，同一键重写就是覆盖 ─────────────────────────


def test_one_run_row_carries_multiple_artifacts():
    _save_artifact({"text": "大纲"}, "sha256:a1", port_id="outline")
    _save_artifact({"text": "意见"}, "sha256:a2", port_id="feedback")

    rows = artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer")
    assert [row["port_id"] for row in rows] == ["feedback", "outline"]
    assert artifact_repo.get_artifact(
        workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer", port_id="outline"
    )["payload_json"] == '{"text": "大纲"}'


def test_rewriting_an_artifact_replaces_its_payload():
    """同一键重写就是覆盖：不会并存两份，`event_time` 推进到本次写入。"""
    _save_artifact({"text": "大纲"}, "sha256:a1")
    rewritten = _save_artifact({"text": "大纲（改）"}, "sha256:a1-changed", seconds=10)

    rows = artifact_repo.list_artifacts(workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer")
    assert len(rows) == 1
    assert rewritten["content_hash"] == "sha256:a1-changed"
    assert rewritten["payload_json"] == '{"text": "大纲（改）"}'
    assert rewritten["event_time"] == _at(10).isoformat()


def test_generation_separates_reruns_of_the_same_node():
    old = _save_artifact({"text": "旧"}, "sha256:old")
    new = _save_artifact({"text": "新"}, "sha256:new", generation=1, seconds=10)

    first_generation = artifact_repo.list_artifacts(
        workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer", generation=0
    )
    second_generation = artifact_repo.list_artifacts(
        workflow_id=WORKFLOW, run_id=RUN, node_id="reviewer", generation=1
    )
    assert [row["content_hash"] for row in first_generation] == ["sha256:old"]
    assert [row["content_hash"] for row in second_generation] == ["sha256:new"]
    assert (old["generation"], new["generation"]) == (0, 1)


# ── 对话：只追加，按时间升序读回 ──────────────────────────────────────────


def test_messages_are_read_oldest_first_within_window():
    for index in range(3):
        chat_repo.add_message(
            message_id=f"m{index}", role="user", type="chat", content=f"第 {index} 条", at=_at(index)
        )

    rows = chat_repo.list_messages(limit=2)
    assert [row["message_id"] for row in rows] == ["m1", "m2"]
    assert chat_repo.get_message(message_id="m0")["content"] == "第 0 条"


def test_duplicate_message_id_is_rejected():
    chat_repo.add_message(message_id="m0", role="user", type="proposal", content="开始", at=BASE)

    with pytest.raises(sqlite3.IntegrityError):
        chat_repo.add_message(message_id="m0", role="user", type="chat", content="重复", at=BASE)
