"""图定义、node_id 注册与图快照冻结契约。"""

from dataclasses import replace

import pytest

from teacheragent.workflows import (
    CONTENT_PIPELINE_ARTIFACT_TYPES,
    CONTENT_PIPELINE_WORKFLOW_ID,
    ApprovalScopeType,
    EdgeEndpoint,
    NodeKind,
    UnknownNodeError,
    WorkflowDefinition,
    WorkflowDefinitionError,
    WorkflowNotFoundError,
    freeze_definition,
    freeze_snapshot,
    get_definition,
    list_definitions,
    main_workflow_definition,
    port,
    register_definition,
    registered_node_ids,
    require_node,
    validate_definition,
)
from teacheragent.workflows.content_pipeline.artifacts import (
    CONTENT_DRAFT,
    PUBLICATION_MANIFEST,
)

FROZEN_AT = "2026-10-07T00:00:00+00:00"

NODE_IDS = frozenset({
    "tutor-trigger",
    "context-snapshot",
    "intent-planner",
    "brief-approval",
    "outline-architect",
    "outline-contract-gate",
    "outline-approval",
    "chapter-writers",
    "reviewer",
    "reviser",
    "chapter-approval",
    "beautifier",
    "assessment-generator",
    "quality-gate",
    "publish-approval",
    "publisher",
})

EDGE_IDS = frozenset({
    "e-trigger-context",
    "e-context-planner",
    "e-planner-brief",
    "e-brief-approved",
    "e-brief-revise",
    "e-outline-validate",
    "e-outline-invalid",
    "e-outline-approval",
    "e-outline-revise",
    "e-outline-write",
    "e-writer-review",
    "e-writer-chapter",
    "e-writer-revise",
    "e-review-revise",
    "e-review-chapter",
    "e-revise-review",
    "e-chapter-revise",
    "e-chapter-beautify",
    "e-chapter-assess",
    "e-beautify-quality",
    "e-assessment-quality",
    "e-quality-revise",
    "e-quality-publish",
    "e-publish-revise",
    "e-publish-final",
})


def _codes(definition: WorkflowDefinition) -> set[str]:
    """该校图定义在当前产物词表下的全部问题码。"""
    issues = validate_definition(definition, artifact_types=CONTENT_PIPELINE_ARTIFACT_TYPES)
    return {issue.code for issue in issues}


def _patch_node(
    definition: WorkflowDefinition,
    node_id: str,
    **changes: object,
) -> WorkflowDefinition:
    """替换某个节点的字段，构造非法定义。"""
    return replace(
        definition,
        nodes=tuple(
            replace(node, **changes) if node.id == node_id else node
            for node in definition.nodes
        ),
    )


def _patch_edge(
    definition: WorkflowDefinition,
    edge_id: str,
    **changes: object,
) -> WorkflowDefinition:
    """替换某条连线的字段，构造非法定义。"""
    return replace(
        definition,
        edges=tuple(
            replace(edge, **changes) if edge.id == edge_id else edge
            for edge in definition.edges
        ),
    )


# --- 图定义与注册 -------------------------------------------------------------


def test_content_pipeline_workflow_is_registered_on_import():
    registered = get_definition(CONTENT_PIPELINE_WORKFLOW_ID)

    assert registered is main_workflow_definition
    assert [item.id for item in list_definitions()] == [CONTENT_PIPELINE_WORKFLOW_ID]


def test_workflow_graph_matches_the_frontend_definition():
    assert main_workflow_definition.id == CONTENT_PIPELINE_WORKFLOW_ID
    assert main_workflow_definition.name == "教材生产主流程"
    assert main_workflow_definition.version == 1
    assert main_workflow_definition.entry_node_ids == ("tutor-trigger",)
    assert main_workflow_definition.node_ids == NODE_IDS
    assert {edge.id for edge in main_workflow_definition.edges} == EDGE_IDS


def test_workflow_definition_has_no_validation_issues():
    assert validate_definition(
        main_workflow_definition,
        artifact_types=CONTENT_PIPELINE_ARTIFACT_TYPES,
    ) == ()


def test_registered_node_ids_cover_every_node():
    assert registered_node_ids(CONTENT_PIPELINE_WORKFLOW_ID) == NODE_IDS


def test_require_node_returns_the_registered_node():
    node = require_node(CONTENT_PIPELINE_WORKFLOW_ID, "reviser")

    assert node.id == "reviser"
    assert node.kind is NodeKind.AGENT


def test_require_node_rejects_unknown_node_id():
    with pytest.raises(UnknownNodeError, match="不存在节点"):
        require_node(CONTENT_PIPELINE_WORKFLOW_ID, "ghost-node")


def test_get_definition_rejects_unknown_workflow():
    with pytest.raises(WorkflowNotFoundError, match="未注册的工作流"):
        get_definition("ghost-workflow")


def test_register_rejects_duplicate_workflow_id():
    with pytest.raises(WorkflowDefinitionError, match="已注册"):
        register_definition(main_workflow_definition)


def test_register_rejects_invalid_definition():
    with pytest.raises(WorkflowDefinitionError, match="工作流定义无效"):
        register_definition(replace(main_workflow_definition, id="broken", entry_node_ids=()))


# --- 节点与端口的图语义 -------------------------------------------------------


def test_agent_nodes_declare_role_and_prompt_asset():
    agents = [node for node in main_workflow_definition.nodes if node.kind is NodeKind.AGENT]

    assert len(agents) == 6
    for node in agents:
        assert node.role_id, node.id
        assert node.prompt_ref is not None
        assert node.prompt_ref.startswith("agent/prompts/")
        assert node.prompt_ref.endswith(".md")


def test_human_gate_nodes_declare_their_scope():
    gates = {
        node.id: node.human_approval
        for node in main_workflow_definition.nodes
        if node.kind is NodeKind.HUMAN_GATE
    }

    assert sorted(gates) == [
        "brief-approval",
        "chapter-approval",
        "outline-approval",
        "publish-approval",
    ]
    assert gates["brief-approval"].scope_type is ApprovalScopeType.WORKFLOW
    assert gates["publish-approval"].scope_type is ApprovalScopeType.PUBLISH


def test_node_payload_carries_ports_role_and_prompt():
    payload = main_workflow_definition.node("reviser").to_payload()

    assert payload["roleId"] == "reviser"
    assert payload["promptRef"] == "agent/prompts/reviser.md"
    assert payload["inputs"][0] == {
        "id": "drafts",
        "artifactType": CONTENT_DRAFT,
        "required": True,
        "multiple": True,
        "description": CONTENT_DRAFT,
    }
    assert "humanApproval" not in payload


def test_human_gate_payload_carries_the_approval_definition():
    payload = main_workflow_definition.node("chapter-approval").to_payload()

    assert payload["humanApproval"] == {
        "scopeType": "chapter",
        "perItem": True,
        "allowBatch": True,
        "required": True,
        "itemPort": "drafts",
        "approvedOutcome": "章节通过",
        "changesOutcome": "提出审批意见",
    }


def test_definition_payload_uses_the_frontend_key_names():
    payload = main_workflow_definition.to_payload()

    assert sorted(payload) == ["description", "edges", "entryNodeIds", "id", "name", "nodes"]
    edge = next(item for item in payload["edges"] if item["id"] == "e-publish-final")
    assert edge == {
        "id": "e-publish-final",
        "from": {"nodeId": "publish-approval", "portId": "approved"},
        "to": {"nodeId": "publisher", "portId": "manifest"},
        "label": "确认发布",
        "condition": "确认发布",
    }


# --- 校验规则 -----------------------------------------------------------------


def test_duplicate_node_id_is_rejected():
    definition = replace(
        main_workflow_definition,
        nodes=main_workflow_definition.nodes + (main_workflow_definition.node("publisher"),),
    )

    assert "duplicate-node-id" in _codes(definition)


def test_duplicate_edge_id_is_rejected():
    definition = replace(
        main_workflow_definition,
        edges=main_workflow_definition.edges + (main_workflow_definition.edges[0],),
    )

    assert "duplicate-edge-id" in _codes(definition)


def test_missing_entry_is_rejected():
    assert "missing-entry" in _codes(replace(main_workflow_definition, entry_node_ids=()))


def test_unknown_entry_node_is_rejected():
    definition = replace(main_workflow_definition, entry_node_ids=("ghost-node",))

    assert "unknown-entry-node" in _codes(definition)


def test_invalid_version_is_rejected():
    assert "invalid-version" in _codes(replace(main_workflow_definition, version=0))


def test_agent_without_role_is_rejected():
    definition = _patch_node(main_workflow_definition, "reviewer", role_id=None)

    assert "agent-without-role" in _codes(definition)


def test_agent_without_prompt_ref_is_rejected():
    definition = _patch_node(main_workflow_definition, "reviewer", prompt_ref=None)

    assert "agent-without-prompt" in _codes(definition)


def test_prompt_ref_outside_the_asset_namespace_is_rejected():
    definition = _patch_node(
        main_workflow_definition,
        "reviewer",
        prompt_ref="content-pipeline/reviewer",
    )

    assert "prompt-ref-shape" in _codes(definition)


def test_human_gate_without_approval_is_rejected():
    definition = _patch_node(main_workflow_definition, "publish-approval", human_approval=None)

    assert "human-gate-without-approval" in _codes(definition)


def test_unknown_edge_source_is_rejected():
    definition = _patch_edge(
        main_workflow_definition,
        "e-publish-final",
        source=EdgeEndpoint(node_id="ghost-node", port_id="approved"),
    )

    assert "unknown-edge-source" in _codes(definition)


def test_unknown_edge_target_is_rejected():
    definition = _patch_edge(
        main_workflow_definition,
        "e-publish-final",
        target=EdgeEndpoint(node_id="ghost-node", port_id="manifest"),
    )

    assert "unknown-edge-target" in _codes(definition)


def test_unknown_output_port_is_rejected():
    definition = _patch_edge(
        main_workflow_definition,
        "e-publish-final",
        source=EdgeEndpoint(node_id="publish-approval", port_id="ghost"),
    )

    assert "unknown-output-port" in _codes(definition)


def test_unknown_input_port_is_rejected():
    definition = _patch_edge(
        main_workflow_definition,
        "e-publish-final",
        target=EdgeEndpoint(node_id="publisher", port_id="ghost"),
    )

    assert "unknown-input-port" in _codes(definition)


def test_artifact_type_mismatch_is_rejected():
    definition = _patch_edge(
        main_workflow_definition,
        "e-review-revise",
        target=EdgeEndpoint(node_id="reviser", port_id="feedback"),
    )

    assert "artifact-type-mismatch" in _codes(definition)


def test_unreachable_node_is_rejected():
    definition = replace(
        main_workflow_definition,
        edges=tuple(
            edge
            for edge in main_workflow_definition.edges
            if edge.target.node_id != "publisher"
        ),
    )

    assert "unreachable-node" in _codes(definition)


def test_duplicate_port_id_is_rejected():
    definition = _patch_node(
        main_workflow_definition,
        "publisher",
        outputs=(
            port("published", PUBLICATION_MANIFEST),
            port("published", PUBLICATION_MANIFEST),
        ),
    )

    assert "duplicate-port-id" in _codes(definition)


def test_unknown_artifact_type_is_rejected():
    definition = _patch_node(
        main_workflow_definition,
        "publisher",
        outputs=(port("published", "UnknownArtifact"),),
    )

    assert "unknown-artifact-type" in _codes(definition)


def test_artifact_type_vocabulary_is_optional():
    definition = _patch_node(
        main_workflow_definition,
        "publisher",
        outputs=(port("published", "UnknownArtifact"),),
    )

    assert validate_definition(definition) == ()


# --- 图快照冻结 ---------------------------------------------------------------


def test_freeze_snapshot_is_content_addressed():
    first = freeze_snapshot(CONTENT_PIPELINE_WORKFLOW_ID, frozen_at=FROZEN_AT)
    second = freeze_snapshot(CONTENT_PIPELINE_WORKFLOW_ID, frozen_at="2026-10-07T00:00:01+00:00")

    assert first.content_hash == second.content_hash
    assert first.content_hash.startswith("sha256:")
    assert first.version == main_workflow_definition.version
    assert first.node_ids == registered_node_ids(CONTENT_PIPELINE_WORKFLOW_ID)
    assert first.frozen_at == FROZEN_AT


def test_freeze_definition_hash_tracks_graph_content():
    baseline = freeze_definition(main_workflow_definition)
    changed = freeze_definition(replace(main_workflow_definition, description="改过的描述"))

    assert baseline.content_hash != changed.content_hash


def test_snapshot_payload_carries_the_frozen_graph():
    snapshot = freeze_snapshot(CONTENT_PIPELINE_WORKFLOW_ID, frozen_at=FROZEN_AT)

    assert snapshot.to_payload() == {
        "workflowId": CONTENT_PIPELINE_WORKFLOW_ID,
        "version": main_workflow_definition.version,
        "contentHash": snapshot.content_hash,
        "nodeIds": sorted(NODE_IDS),
        "definition": main_workflow_definition.to_payload(),
        "frozenAt": FROZEN_AT,
    }


def test_freeze_snapshot_stamps_utc_time_by_default():
    assert freeze_snapshot(CONTENT_PIPELINE_WORKFLOW_ID).frozen_at.endswith("+00:00")
