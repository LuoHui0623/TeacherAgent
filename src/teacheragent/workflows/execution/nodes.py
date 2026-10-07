"""节点执行：把一个节点实例跑成产物。

只算不落库 —— 执行事实与产物的写入由调度器在同一个事务里完成。没有执行实现的
节点类型或角色直接报错、不静默跳过，因此图里出现执行器做不到的节点会立刻暴露，
该行进入 `failed` 并留下错误。

平台节点目前是最小可跑版本，逐个换成能力域实现属于后续任务：`context` 只把上游事件
与画像摘要冻结成快照，`contract-gate` 只判定必填输入产物是否齐备，`persist` 把输入
清单原样发布出去。

门禁的两个输出端口由节点 `config` 的 `approvePort` / `rejectPort` 显式声明：决断写哪
个端口是图的事实，不靠端口顺序猜。
"""

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any, Final, cast

from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.infrastructure.llm.prompts import Prompt, load_prompt
from teacheragent.infrastructure.store.sqlite.repositories import user_profiles
from teacheragent.infrastructure.store.sqlite.repositories.user_profiles import DEFAULT_USER_KEY
from teacheragent.workflows.contracts import (
    APPROVE_PORT_KEY,
    REJECT_PORT_KEY,
    Node,
    NodeKind,
)
from teacheragent.workflows.errors import (
    MissingNodeImplementationError,
    NodeExecutionError,
    UnsupportedNodeKindError,
)
from teacheragent.workflows.execution.contracts import (
    NodeExecution,
    NodeOutcome,
    ProducedArtifact,
)
from teacheragent.workflows.execution.status import NodeRunStatus

NodeHandler = Callable[[NodeExecution], NodeOutcome]
"""一次节点执行的实现。"""

RoleImplementation = Callable[[NodeExecution, WorkflowCallOrigin], Any]
"""一个节点角色的能力实现：读输入与调用身份，返回该节点的产物正文。"""

_ROLE_KINDS: Final[frozenset[NodeKind]] = frozenset({NodeKind.AGENT, NodeKind.FAN_OUT})
"""按 `roleId` 找能力实现的节点类型。"""


def execute_node(
    execution: NodeExecution,
    *,
    implementations: Mapping[str, RoleImplementation],
) -> NodeOutcome:
    """执行一个节点实例并返回它的产出；`implementations` 是节点角色到能力实现的映射。"""
    kind = execution.node.kind
    if kind in _ROLE_KINDS:
        return _run_role(execution, implementations=implementations)
    if kind is NodeKind.CONTEXT:
        return _run_context(execution)
    if kind is NodeKind.CONTRACT_GATE:
        return _run_contract_gate(execution)
    if kind is NodeKind.HUMAN_GATE:
        return _run_human_gate(execution)
    if kind is NodeKind.PERSIST:
        return _run_persist(execution)
    raise UnsupportedNodeKindError(f"节点类型还没有执行实现：{kind}（{execution.node.id}）")


def gate_ports(node: Node) -> tuple[str, str]:
    """取门禁节点的「通过」与「否决」输出端口 id；未声明即报错。"""
    approve = node.config.get(APPROVE_PORT_KEY)
    reject = node.config.get(REJECT_PORT_KEY)
    if not isinstance(approve, str) or not isinstance(reject, str):
        raise NodeExecutionError(
            f"门禁节点必须用 config 声明 {APPROVE_PORT_KEY} 与 {REJECT_PORT_KEY}：{node.id}"
        )
    for port_id in (approve, reject):
        if node.output_port(port_id) is None:
            raise NodeExecutionError(f"门禁声明的输出端口不存在：{node.id}.{port_id}")
    return approve, reject


def review_payload(
    *,
    node: Node,
    decision: str,
    comments: str,
    content_hash: str,
) -> dict[str, Any]:
    """构造一行门禁评估的正文；`reviewer` 由节点类型决定（人工门禁是用户，其余是 AI）。"""
    approval = node.human_approval
    scope = str(approval.scope_type) if approval is not None else "workflow"
    return {
        "scopeType": scope,
        "reviewer": "user" if node.kind is NodeKind.HUMAN_GATE else "ai",
        "decision": decision,
        "comments": comments,
        "contentHash": content_hash,
    }


def _run_role(
    execution: NodeExecution,
    *,
    implementations: Mapping[str, RoleImplementation],
) -> NodeOutcome:
    """按 `roleId` 找能力实现，把它的产物正文写到该节点唯一的输出端口。"""
    node = execution.node
    if node.role_id is None:
        raise NodeExecutionError(f"节点缺少 roleId：{node.id}")
    handler = implementations.get(node.role_id)
    if handler is None:
        raise MissingNodeImplementationError(f"节点角色还没有能力实现：{node.role_id}（{node.id}）")
    payload = handler(execution, call_origin(execution))
    return NodeOutcome(
        status=NodeRunStatus.SUCCEEDED,
        artifacts=(ProducedArtifact(port_id=single_output(node).id, payload=payload),),
    )


def call_origin(execution: NodeExecution) -> WorkflowCallOrigin:
    """这次调用的节点身份：`llm_runs` 靠它归组到具体节点实例。

    `prompt_ref` 取节点声明的资产路径；`prompt_content_hash` 在资产存在时由加载得到。
    资产缺失不算调用身份的问题 —— 真正加载它的能力实现会失败并留下明确错误，
    这里不替它报错，也不静默把业务错误吞掉。
    `bindings` 记下这次执行读到的产物版本，用来回答「这份产物基于哪一版输入」。
    """
    node = execution.node
    prompt = _declared_prompt(node)
    return WorkflowCallOrigin(
        workflow_id=execution.definition.id,
        workflow_run_id=execution.run_id,
        node_id=node.id,
        generation=execution.generation,
        item_key=execution.item_key,
        prompt_ref=node.prompt_ref,
        prompt_content_hash=prompt.content_hash if prompt is not None else None,
        bindings=_bindings(execution),
    )


def _declared_prompt(node: Node) -> Prompt | None:
    """加载节点声明的提示词资产；没声明或资产尚未编写时返回 None。"""
    if node.prompt_ref is None:
        return None
    try:
        return load_prompt(node.prompt_ref)
    except FileNotFoundError:
        return None


def _bindings(execution: NodeExecution) -> dict[str, list[dict[str, str]]]:
    """这次执行读了哪些产物版本，按输入端口归组。"""
    return {
        port_id: [
            {
                "node_id": item.node_id,
                "port_id": item.port_id,
                "item_key": item.item_key,
                "content_hash": item.content_hash,
            }
            for item in items
        ]
        for port_id, items in execution.inputs.items()
        if items
    }


def _run_context(execution: NodeExecution) -> NodeOutcome:
    """上下文节点：把上游事件与画像摘要冻结成一份快照，不调用模型。"""
    node = execution.node
    events = [
        event
        for batch in execution.payloads("events")
        for event in _as_events(batch)
    ]
    payload: dict[str, Any] = {
        "id": f"{execution.run_id}:{node.id}",
        "learnerId": _current_learner_id(),
        "capturedAt": _utc_now(),
        "query": _first_summary(events),
        "profileSummary": _profile_summary(),
        "currentLevel": "",
        "preferences": [],
        "knownKnowledgePointIds": [],
        "weakKnowledgePointIds": [],
        "sourceEventIds": [f"event-{index + 1}" for index in range(len(events))],
    }
    return NodeOutcome(
        status=NodeRunStatus.SUCCEEDED,
        artifacts=(ProducedArtifact(port_id=single_output(node).id, payload=payload),),
    )


def _run_human_gate(execution: NodeExecution) -> NodeOutcome:
    """人工门禁：执行到此停下等决断，本身不产出产物。"""
    return NodeOutcome(status=NodeRunStatus.WAITING_HUMAN)


def _run_contract_gate(execution: NodeExecution) -> NodeOutcome:
    """契约门：必填输入产物齐备即通过，否则否决并说明缺什么。

    只做结构判定；产物内容的校验属于后续能力实现。
    """
    approve, reject = gate_ports(execution.node)
    missing = [
        port.id
        for port in execution.node.inputs
        if port.required and not execution.artifacts_for(port.id)
    ]
    reviewed = execution.artifacts_for(required_input(execution.node))
    content_hash = reviewed[0].content_hash if reviewed else ""
    decision = "changes-requested" if missing else "approved"
    decision = "changes-requested" if missing else "approved"
    return NodeOutcome(
        status=NodeRunStatus.SUCCEEDED,
        artifacts=(
            ProducedArtifact(
                port_id=reject if missing else approve,
                payload=review_payload(
                    node=execution.node,
                    decision=decision,
                    comments="缺少必需输入：" + "、".join(missing) if missing else "",
                    content_hash=content_hash,
                ),
            ),
        ),
    )


def _run_persist(execution: NodeExecution) -> NodeOutcome:
    """落库节点：把输入清单原样发布成自己的输出产物。"""
    node = execution.node
    port = single_output(node)
    artifact = execution.artifacts_for(required_input(node))[0]
    return NodeOutcome(
        status=NodeRunStatus.SUCCEEDED,
        artifacts=(ProducedArtifact(port_id=port.id, payload=artifact.payload),),
    )


def single_output(node: Node):
    """节点唯一的输出端口；多于一个时该节点不该用这条执行路径。"""
    if len(node.outputs) != 1:
        raise NodeExecutionError(f"该执行路径要求节点只有一个输出端口：{node.id}")
    return node.outputs[0]


def required_input(node: Node) -> str:
    """节点第一个必填输入端口的 id；没有必填输入端口时说明该节点不能用这条执行路径。"""
    for port in node.inputs:
        if port.required:
            return port.id
    raise NodeExecutionError(f"节点没有必填输入端口：{node.id}")


def _as_events(batch: Any) -> list[Mapping[str, Any]]:
    """从一批事件里取出事件列表；不是事件批次时返回空。"""
    if not isinstance(batch, Mapping):
        return []
    events: Any = cast(Mapping[str, Any], batch).get("events")
    if not isinstance(events, list):
        return []
    return [
        cast(Mapping[str, Any], event)
        for event in cast(list[Any], events)
        if isinstance(event, Mapping)
    ]


def _first_summary(events: list[Mapping[str, Any]]) -> str:
    for event in events:
        summary = event.get("summary")
        if isinstance(summary, str):
            return summary
    return ""


def _current_learner_id() -> str:
    return DEFAULT_USER_KEY


def _profile_summary() -> str:
    """当前画像的原文摘要；没有画像时为空串。

    画像的结构化解析还没接进执行器（属于后续任务），因此不在这里编造分区内容。
    """
    row = user_profiles.current()
    return row["content"] if row is not None else ""


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
