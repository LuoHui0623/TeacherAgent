"""运行读模型的返回结构：pipeline 历史、节点摘要与节点提示词地图。

前端是纯投影，所以这里给的是可以直接渲染的形状：run 状态由 `node_runs` 派生，
节点的每次调用摊成固定的六阶段。字段名是传给前端的 JSON 名。
"""

from typing import Any, Literal, TypedDict

StageState = Literal["pending", "filled", "streaming", "failed"]
"""阶段状态：尚未发生、已填充、输出中、失败；数据字段与它同步为空或非空。"""


class VariableBinding(TypedDict):
    """模板声明的一个变量由什么填充。

    `portId` 非空说明同名输入端口上取到了产物版本；`portId` 为空但状态是 `bound`
    说明值来自平台上下文，本次运行没有对应产物。节点还没调用过时全部是 `pending`。
    """

    name: str
    state: Literal["pending", "bound"]
    portId: str | None
    nodeId: str | None
    itemKey: str | None
    contentHash: str | None


class TemplateData(TypedDict):
    """待填充模板：模板原文、变量清单、变量绑定与漂移标注。"""

    ref: str
    currentHash: str | None
    runHash: str | None
    changed: bool
    variables: list[str]
    bindings: list[VariableBinding]
    template: str | None
    staticPrefix: str | None
    injection: str | None


class TemplateStage(TypedDict):
    """模板阶段：正文按 ref 现取，`changed` 说明这次运行用的版本与当前文件是否同版。"""

    kind: Literal["template"]
    state: StageState
    data: TemplateData | None


class SourceItem(TypedDict):
    """这次调用用到的提示词资产片段。"""

    ref: str
    name: str | None
    order: int
    role: str
    contentHash: str
    templateText: str
    renderedText: str


class SourcesStage(TypedDict):
    """来源资产阶段：模板的哪几段进了这次调用。"""

    kind: Literal["sources"]
    state: StageState
    data: list[SourceItem] | None


class BindingItem(TypedDict):
    """一个变量由哪份产物版本填充。"""

    portId: str
    nodeId: str
    itemKey: str
    contentHash: str


class ContextStage(TypedDict):
    """上下文注入阶段：按输入端口列出这次读到的产物版本。"""

    kind: Literal["context"]
    state: StageState
    data: list[BindingItem] | None


class MessagesStage(TypedDict):
    """最终消息阶段：真正发往 provider 的消息。"""

    kind: Literal["messages"]
    state: StageState
    data: list[dict[str, Any]] | None


class RequestData(TypedDict):
    """提交给 provider 的调用参数。"""

    provider: str
    model: str
    role: str
    temperature: float
    attempt: int
    startedAt: str


class RequestStage(TypedDict):
    """已提交请求阶段。"""

    kind: Literal["request"]
    state: StageState
    data: RequestData | None


class OutputData(TypedDict):
    """这次调用的结果。"""

    message: dict[str, Any] | None
    promptTokens: int
    completionTokens: int
    totalTokens: int
    durationMs: int
    completedAt: str
    error: str


class OutputStage(TypedDict):
    """模型输出阶段。"""

    kind: Literal["output"]
    state: StageState
    data: OutputData | None


PromptMapStage = (
    TemplateStage | SourcesStage | ContextStage | MessagesStage | RequestStage | OutputStage
)
"""六个阶段各自的取数；按 `kind` 区分。文案与渲染由前端按 `kind` 决定。"""


class PromptMapCall(TypedDict):
    """提示词地图上的一次调用。

    `callId` 为 None 表示这还是一次预期的调用 —— 节点尚未运行，六阶段只有模板阶段
    有内容，状态是 `pending`。
    """

    callId: str | None
    sequence: int
    attempt: int
    itemKey: str
    generation: int
    role: str
    status: str
    stages: list[PromptMapStage]


class ArtifactRef(TypedDict):
    """一个产物版本的引用与正文。"""

    nodeId: str
    portId: str
    itemKey: str
    generation: int
    type: str
    contentHash: str
    payload: Any


class NodeRunSummary(TypedDict):
    """一个图节点在该次运行里的执行摘要。"""

    nodeId: str
    kind: str
    label: str
    status: str
    attempts: int
    itemKeys: list[str]
    callCount: int
    eventTime: str
    error: str
    inputs: list[ArtifactRef]
    outputs: list[ArtifactRef]


class WorkflowGraphPayload(TypedDict):
    """该 run 冻结的图快照。"""

    id: str
    name: str
    description: str
    version: int
    contentHash: str
    entryNodeIds: list[str]
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


class WorkflowRunSummary(TypedDict):
    """pipeline 历史的一行。"""

    runId: str
    workflowId: str
    status: str
    startedAt: str
    updatedAt: str
    durationMs: int
    nodeCount: int
    graphContentHash: str
    triggerMessageId: str | None


class WorkflowRunDetail(WorkflowRunSummary):
    """一次运行的详情：摘要加冻结的图与节点摘要。"""

    graph: WorkflowGraphPayload
    nodes: list[NodeRunSummary]


class WorkflowRunNodeList(TypedDict):
    """该次运行的节点摘要列表。"""

    runId: str
    nodes: list[NodeRunSummary]


class PromptMap(TypedDict):
    """一个节点的提示词地图：三态由 `nodeStatus` 与各阶段 `state` 表达。"""

    runId: str
    workflowId: str
    nodeId: str
    nodeStatus: str
    promptRef: str | None
    template: TemplateData | None
    calls: list[PromptMapCall]
    inputs: list[ArtifactRef]
    outputs: list[ArtifactRef]
