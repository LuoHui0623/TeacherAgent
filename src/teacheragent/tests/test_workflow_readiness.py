"""就绪判定与图快照还原的契约：门禁未决不放行、放行端口不产出新产物、代次隔离。"""

import pytest

from teacheragent.workflows import (
    ArtifactState,
    NodeInstance,
    NodeRunStatus,
    RunState,
    WorkflowDefinitionError,
    definition_from_payload,
    freeze_definition,
    main_workflow_definition,
    ready_instances,
    snapshot_definition,
)


def _run(node_id: str, status: str, *, item: str = "") -> RunState:
    return RunState(
        node_id=node_id,
        item_key=item,
        status=NodeRunStatus(status),
    )


def _artifact(
    node_id: str,
    port_id: str,
    *,
    item: str = "",
) -> ArtifactState:
    return ArtifactState(
        node_id=node_id,
        port_id=port_id,
        item_key=item,
        content_hash=f"sha256:{node_id}-{port_id}-{item}",
    )


def _ready(
    node_id: str,
    item: str = "",
    *,
    runs: list[RunState] | None = None,
    artifacts: list[ArtifactState] | None = None,
) -> bool:
    ready = ready_instances(
        main_workflow_definition,
        instances=[NodeInstance(node_id, item)],
        runs=runs or [],
        artifacts=artifacts or [],
    )
    return bool(ready)


def test_entry_node_is_ready_without_inputs():
    assert _ready("tutor-trigger")


def test_downstream_needs_both_success_and_artifact():
    assert _ready("context-snapshot", runs=[_run("tutor-trigger", "succeeded")]) is False
    assert _ready("context-snapshot", artifacts=[_artifact("tutor-trigger", "events")]) is False
    assert _ready(
        "context-snapshot",
        runs=[_run("tutor-trigger", "succeeded")],
        artifacts=[_artifact("tutor-trigger", "events")],
    )


def test_pending_instance_stays_ready_but_finished_ones_do_not():
    assert _ready("tutor-trigger", runs=[_run("tutor-trigger", "pending")])
    for status in ("running", "succeeded", "failed", "cancelled"):
        assert _ready("tutor-trigger", runs=[_run("tutor-trigger", status)]) is False


def test_human_gate_starts_but_blocks_downstream_until_decided():
    upstream = [_run("intent-planner", "succeeded")]
    brief = [_artifact("intent-planner", "brief")]

    assert _ready("brief-approval", runs=upstream, artifacts=brief)

    waiting = [*upstream, _run("brief-approval", "waiting-human")]
    assert _ready("outline-architect", runs=waiting, artifacts=brief) is False


def test_gate_produces_its_own_review_instead_of_passing_content_through():
    """门禁产出自己的评估行（`GateReview`），下游要的是那一行，不再是上游的内容行。"""
    runs = [_run("intent-planner", "succeeded"), _run("brief-approval", "succeeded")]

    assert (
        _ready("outline-architect", runs=runs, artifacts=[_artifact("intent-planner", "brief")])
        is False
    )
    assert _ready(
        "outline-architect",
        runs=runs,
        artifacts=[
            _artifact("intent-planner", "brief"),
            _artifact("brief-approval", "approved"),
        ],
    )


def test_contract_gate_output_requires_its_own_artifact():
    """`quality-gate.passed` 是它自己产出的评估行，不会被上游产物代替。"""
    runs = [
        _run("beautifier", "succeeded"),
        _run("assessment-generator", "succeeded"),
        _run("quality-gate", "succeeded"),
    ]
    upstream = [
        _artifact("beautifier", "beautified"),
        _artifact("assessment-generator", "assessments"),
    ]

    assert _ready("publish-approval", runs=runs, artifacts=upstream) is False
    assert _ready(
        "publish-approval",
        runs=runs,
        artifacts=[*upstream, _artifact("quality-gate", "passed")],
    )


def test_per_item_gate_only_accepts_its_own_chapter():
    runs = [_run("chapter-writers", "succeeded", item="chapter-01"), _run("reviewer", "succeeded")]
    artifacts = [
        _artifact("chapter-writers", "drafts", item="chapter-01"),
        _artifact("reviewer", "report"),
    ]

    assert _ready("chapter-approval", "chapter-01", runs=runs, artifacts=artifacts)
    assert _ready("chapter-approval", "chapter-02", runs=runs, artifacts=artifacts) is False


def test_whole_node_instance_waits_for_every_chapter():
    runs = [
        _run("chapter-approval", "succeeded", item="chapter-01"),
        _run("chapter-approval", "waiting-human", item="chapter-02"),
    ]
    artifacts = [
        _artifact("chapter-approval", "approved", item="chapter-01"),
        _artifact("chapter-approval", "approved", item="chapter-02"),
    ]

    assert _ready("beautifier", runs=runs, artifacts=artifacts) is False

    runs[1] = _run("chapter-approval", "succeeded", item="chapter-02")
    assert _ready("beautifier", runs=runs, artifacts=artifacts)


def test_ready_instances_keeps_the_given_order_and_filters_unknown_nodes():
    instances = [
        NodeInstance("context-snapshot"),
        NodeInstance("tutor-trigger"),
        NodeInstance("no-such-node"),
    ]

    ready = ready_instances(main_workflow_definition, instances=instances)

    assert ready == (NodeInstance("tutor-trigger"),)


def test_frozen_snapshot_rebuilds_the_same_graph():
    snapshot = freeze_definition(main_workflow_definition)

    restored = snapshot_definition(snapshot.to_payload())

    assert restored.to_payload() == main_workflow_definition.to_payload()
    assert restored.version == main_workflow_definition.version
    assert restored.node_ids == main_workflow_definition.node_ids
    assert restored.node("chapter-approval").human_approval is not None
    assert str(restored.node("chapter-approval").human_approval.scope_type) == "chapter"
    assert restored.node("beautifier").prompt_ref == "agent/prompts/beautifier.md"


def test_incomplete_payload_is_rejected():
    with pytest.raises(WorkflowDefinitionError):
        definition_from_payload({"id": "content-pipeline-main"})


def test_unknown_node_kind_is_rejected():
    payload = main_workflow_definition.to_payload()
    payload["nodes"][0]["kind"] = "unknown-kind"

    with pytest.raises(WorkflowDefinitionError):
        definition_from_payload(payload)
