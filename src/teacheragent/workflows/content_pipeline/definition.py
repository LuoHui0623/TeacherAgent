"""教材生产线主流程的图定义。

图定义是后端持有的资产：节点 id、节点类型、节点角色、提示词引用、端口与连线。
节点 id 是运行记录归属节点的唯一标识；图内容变更时必须递增 `version`，图快照
同时记录不依赖人工的 `content_hash`。

节点位置（canvas 布局）由前端决定，不在此描述。提示词引用用可加载的资产路径
`agent/prompts/<名称>.md`，与 `load_prompt()` 同一命名空间。
"""

from collections.abc import Sequence
from typing import Final

from teacheragent.workflows.content_pipeline.artifacts import (
    ASSESSMENT_SET,
    BEAUTIFIED_CONTENT,
    CONTENT_DRAFT,
    CONTENT_PIPELINE_ARTIFACT_TYPES,
    CONTEXT_SNAPSHOT,
    GATE_REVIEW,
    LEARNING_BRIEF,
    OUTLINE,
    PUBLICATION_MANIFEST,
    REVIEW_REPORT,
    TUTOR_EVENT_BATCH,
)
from teacheragent.workflows.contracts import (
    ApprovalScopeType,
    Edge,
    EdgeEndpoint,
    HumanApproval,
    JsonValue,
    Node,
    NodeKind,
    Port,
    WorkflowDefinition,
    port,
)
from teacheragent.workflows.registry import register_definition

CONTENT_PIPELINE_WORKFLOW_ID: Final[str] = "content-pipeline-main"
"""教材生产线主流程的 workflow id。"""


def _node(
    *,
    id: str,
    kind: NodeKind,
    label: str,
    description: str,
    inputs: Sequence[Port] = (),
    outputs: Sequence[Port] = (),
    role_id: str | None = None,
    prompt_ref: str | None = None,
    human_approval: HumanApproval | None = None,
    config: dict[str, JsonValue] | None = None,
) -> Node:
    """构造节点，缺省端口与配置为空。"""
    return Node(
        id=id,
        kind=kind,
        label=label,
        description=description,
        inputs=tuple(inputs),
        outputs=tuple(outputs),
        role_id=role_id,
        prompt_ref=prompt_ref,
        human_approval=human_approval,
        config=config or {},
    )


def _edge(
    edge_id: str,
    from_node: str,
    from_port: str,
    to_node: str,
    to_port: str,
    label: str | None = None,
) -> Edge:
    """构造连线；有分支口径时 `condition` 与 `label` 同值。"""
    return Edge(
        id=edge_id,
        source=EdgeEndpoint(node_id=from_node, port_id=from_port),
        target=EdgeEndpoint(node_id=to_node, port_id=to_port),
        label=label,
        condition=label,
    )


main_workflow_definition: Final[WorkflowDefinition] = WorkflowDefinition(
    id=CONTENT_PIPELINE_WORKFLOW_ID,
    name="教材生产主流程",
    description="从 Tutor 上下文到结构化大纲、内容生成、审校、美化和发布的领域主流程。",
    version=1,
    entry_node_ids=("tutor-trigger",),
    nodes=(
        _node(
            id="tutor-trigger",
            kind=NodeKind.TRIGGER,
            label="Tutor 互动",
            description="接收学习请求、提问和学习行为事件。",
            outputs=(port("events", TUTOR_EVENT_BATCH, multiple=True),),
        ),
        _node(
            id="context-snapshot",
            kind=NodeKind.CONTEXT,
            label="上下文快照",
            description="冻结用户画像、学习历史、当前 Query 和约束。",
            inputs=(port("events", TUTOR_EVENT_BATCH, multiple=True),),
            outputs=(port("snapshot", CONTEXT_SNAPSHOT),),
        ),
        _node(
            id="intent-planner",
            kind=NodeKind.AGENT,
            label="意图与任务规划",
            description="识别学习意图、范围、难度和预期结果。",
            role_id="intent-planner",
            prompt_ref="agent/prompts/intent-planner.md",
            inputs=(
                port("snapshot", CONTEXT_SNAPSHOT),
                port("feedback", GATE_REVIEW, required=False),
            ),
            outputs=(port("brief", LEARNING_BRIEF),),
        ),
        _node(
            id="brief-approval",
            kind=NodeKind.HUMAN_GATE,
            label="确认 Learning Brief",
            description="用户确认学习目标、范围和深度。",
            inputs=(port("brief", LEARNING_BRIEF),),
            outputs=(
                port("approved", GATE_REVIEW),
                port("feedback", GATE_REVIEW, required=False),
            ),
            human_approval=HumanApproval(scope_type=ApprovalScopeType.WORKFLOW),
            config={"approvePort": "approved", "rejectPort": "feedback"},
        ),
        _node(
            id="outline-architect",
            kind=NodeKind.AGENT,
            label="大纲架构",
            description="生成章节、学习目标、知识点、体量和依赖。",
            role_id="outline-architect",
            prompt_ref="agent/prompts/outline-architect.md",
            inputs=(
                port("brief", GATE_REVIEW),
                port("feedback", GATE_REVIEW, required=False),
            ),
            outputs=(port("outline", OUTLINE),),
        ),
        _node(
            id="outline-contract-gate",
            kind=NodeKind.CONTRACT_GATE,
            label="大纲 Contract 校验",
            description="验证大纲结构、覆盖范围、依赖和验收标准。",
            inputs=(port("outline", OUTLINE),),
            outputs=(
                port("validated", GATE_REVIEW),
                port("invalid", GATE_REVIEW),
            ),
            config={"approvePort": "validated", "rejectPort": "invalid"},
        ),
        _node(
            id="outline-approval",
            kind=NodeKind.HUMAN_GATE,
            label="确认大纲",
            description="用户确认结构化大纲并决定是否进入内容生产。",
            inputs=(port("outline", GATE_REVIEW),),
            outputs=(
                port("approved", GATE_REVIEW),
                port("feedback", GATE_REVIEW, required=False),
            ),
            human_approval=HumanApproval(
                scope_type=ApprovalScopeType.OUTLINE,
                allow_batch=True,
            ),
            config={"approvePort": "approved", "rejectPort": "feedback"},
        ),
        _node(
            id="chapter-writers",
            kind=NodeKind.FAN_OUT,
            label="章节主笔",
            description="一位章节主笔负责一整个章节的正文编写，多章并行。",
            role_id="chapter-writer",
            inputs=(port("outline", GATE_REVIEW),),
            outputs=(port("drafts", CONTENT_DRAFT, multiple=True),),
            config={
                "concurrency": 4,
                "itemsFrom": "outline",
                "itemsPath": "items",
                "itemKey": "id",
            },
        ),
        _node(
            id="reviewer",
            kind=NodeKind.AGENT,
            label="审校",
            description="检查连续性、术语、颗粒度、重复和章节验收标准。",
            role_id="reviewer",
            prompt_ref="agent/prompts/reviewer.md",
            inputs=(
                port("drafts", CONTENT_DRAFT, multiple=True),
                port("revisions", CONTENT_DRAFT, multiple=True, required=False),
            ),
            outputs=(port("report", REVIEW_REPORT),),
        ),
        _node(
            id="reviser",
            kind=NodeKind.AGENT,
            label="修订整理",
            description="应用审校和用户意见，形成修订与二次整理稿。",
            role_id="reviser",
            prompt_ref="agent/prompts/reviser.md",
            inputs=(
                port("drafts", CONTENT_DRAFT, multiple=True),
                port("report", REVIEW_REPORT),
                port("feedback", GATE_REVIEW, required=False),
                port("validation", GATE_REVIEW, required=False),
            ),
            outputs=(port("revised", CONTENT_DRAFT, multiple=True),),
        ),
        _node(
            id="chapter-approval",
            kind=NodeKind.HUMAN_GATE,
            label="按章节确认修订",
            description="用户逐章通过或提出审批意见。",
            inputs=(
                port("drafts", CONTENT_DRAFT, multiple=True),
                port("report", REVIEW_REPORT),
            ),
            outputs=(
                port("approved", GATE_REVIEW, multiple=True),
                port("feedback", GATE_REVIEW, required=False),
            ),
            human_approval=HumanApproval(
                scope_type=ApprovalScopeType.CHAPTER,
                per_item=True,
                allow_batch=True,
                item_port="drafts",
                approved_outcome="章节通过",
                changes_outcome="提出审批意见",
            ),
            config={"approvePort": "approved", "rejectPort": "feedback"},
        ),
        _node(
            id="beautifier",
            kind=NodeKind.AGENT,
            label="美化与知识点增强",
            description="增加公式、列表、表格、callout、Anchor、图示和封面。",
            role_id="beautifier",
            prompt_ref="agent/prompts/beautifier.md",
            inputs=(port("content", GATE_REVIEW, multiple=True),),
            outputs=(port("beautified", BEAUTIFIED_CONTENT),),
        ),
        _node(
            id="assessment-generator",
            kind=NodeKind.AGENT,
            label="出题",
            description="根据正文和知识点生成题目、答案与解析。",
            role_id="assessment-generator",
            prompt_ref="agent/prompts/assessment-generator.md",
            inputs=(port("content", GATE_REVIEW, multiple=True),),
            outputs=(port("assessments", ASSESSMENT_SET),),
        ),
        _node(
            id="quality-gate",
            kind=NodeKind.CONTRACT_GATE,
            label="质检与渲染验证",
            description="检查公式、Mermaid、Anchor、知识点和内容完整性。",
            inputs=(
                port("beautified", BEAUTIFIED_CONTENT),
                port("assessments", ASSESSMENT_SET),
            ),
            outputs=(
                port("passed", GATE_REVIEW),
                port("failed", GATE_REVIEW),
                port("manifest", PUBLICATION_MANIFEST),
            ),
            config={"approvePort": "passed", "rejectPort": "failed"},
        ),
        _node(
            id="publish-approval",
            kind=NodeKind.HUMAN_GATE,
            label="确认发布",
            description="用户确认最终教材版本。",
            inputs=(port("manifest", GATE_REVIEW),),
            outputs=(
                port("approved", GATE_REVIEW),
                port("feedback", GATE_REVIEW, required=False),
            ),
            human_approval=HumanApproval(scope_type=ApprovalScopeType.PUBLISH),
            config={"approvePort": "approved", "rejectPort": "feedback"},
        ),
        _node(
            id="publisher",
            kind=NodeKind.PERSIST,
            label="发布教材",
            description="冻结教材版本并写入教材资产。",
            inputs=(port("manifest", GATE_REVIEW),),
            outputs=(port("published", PUBLICATION_MANIFEST),),
        ),
    ),
    edges=(
        _edge("e-trigger-context", "tutor-trigger", "events", "context-snapshot", "events"),
        _edge("e-context-planner", "context-snapshot", "snapshot", "intent-planner", "snapshot"),
        _edge("e-planner-brief", "intent-planner", "brief", "brief-approval", "brief"),
        _edge("e-brief-approved", "brief-approval", "approved", "outline-architect", "brief", "审批通过"),
        _edge("e-brief-revise", "brief-approval", "feedback", "intent-planner", "feedback", "要求修改"),
        _edge("e-outline-validate", "outline-architect", "outline", "outline-contract-gate", "outline"),
        _edge("e-outline-invalid", "outline-contract-gate", "invalid", "outline-architect", "feedback", "校验失败"),
        _edge("e-outline-approval", "outline-contract-gate", "validated", "outline-approval", "outline"),
        _edge("e-outline-revise", "outline-approval", "feedback", "outline-architect", "feedback", "要求修改"),
        _edge("e-outline-write", "outline-approval", "approved", "chapter-writers", "outline", "审批通过"),
        _edge("e-writer-review", "chapter-writers", "drafts", "reviewer", "drafts"),
        _edge("e-writer-chapter", "chapter-writers", "drafts", "chapter-approval", "drafts"),
        _edge("e-writer-revise", "chapter-writers", "drafts", "reviser", "drafts"),
        _edge("e-review-revise", "reviewer", "report", "reviser", "report", "存在 issue"),
        _edge("e-review-chapter", "reviewer", "report", "chapter-approval", "report", "审校通过"),
        _edge("e-revise-review", "reviser", "revised", "reviewer", "revisions"),
        _edge("e-chapter-revise", "chapter-approval", "feedback", "reviser", "feedback", "提出审批意见"),
        _edge("e-chapter-beautify", "chapter-approval", "approved", "beautifier", "content", "章节通过"),
        _edge("e-chapter-assess", "chapter-approval", "approved", "assessment-generator", "content", "章节通过"),
        _edge("e-beautify-quality", "beautifier", "beautified", "quality-gate", "beautified"),
        _edge("e-assessment-quality", "assessment-generator", "assessments", "quality-gate", "assessments"),
        _edge("e-quality-revise", "quality-gate", "failed", "reviser", "validation", "质检失败"),
        _edge("e-quality-publish", "quality-gate", "passed", "publish-approval", "manifest"),
        _edge("e-publish-revise", "publish-approval", "feedback", "reviser", "feedback", "驳回"),
        _edge("e-publish-final", "publish-approval", "approved", "publisher", "manifest", "确认发布"),
    ),
)
"""教材生产主流程的图定义；定义即注册。"""

register_definition(
    main_workflow_definition,
    artifact_types=CONTENT_PIPELINE_ARTIFACT_TYPES,
)
