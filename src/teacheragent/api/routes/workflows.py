"""工作流的读接口与控制动作。

前端是纯投影，这里给的都是可以直接渲染的形状。

- `GET /workflows`、`GET /workflows/{workflow_id}`：图定义。源是注册表，语义是「现在长什么样」。
- `GET /workflows/{workflow_id}/runs...`：运行。源是库，语义是「某次运行长什么样」，
  图结构取自该 run 冻结的快照 —— 定义与运行是两个时刻，两条路径各答一个。
- `POST /workflows/{workflow_id}/runs`：发起一次运行，只认一条 `proposal` 消息。
- `POST .../pause`、`.../resume`、`.../nodes/{node_id}/rerun`、`.../nodes/{node_id}/decide`：
  控制动作。暂停 / 继续是执行器内存里的行为（不落库），重跑与决断写进库并立刻推进。
"""

from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from teacheragent.api.services import AppServices, get_executor, get_services
from teacheragent.workflows import (
    ProposalRequiredError,
    TriggerMessageNotFoundError,
    UnknownNodeError,
    WorkflowNotFoundError,
    freeze_snapshot,
    get_definition,
    list_definitions,
    list_workflow_runs,
    load_prompt_map,
    load_workflow_run,
    load_workflow_run_nodes,
    start_run,
)
from teacheragent.workflows.errors import NodeExecutionError
from teacheragent.workflows.execution import RunProgress, WorkflowExecutor
from teacheragent.workflows.execution.readiness import NodeInstance

router = APIRouter(prefix="/workflows", tags=["workflows"])

T = TypeVar("T")


class DecideRequest(BaseModel):
    """一次人工决断。`expectedHash` 是决断人在界面上看到的那一版内容身份。"""

    approved: bool
    comments: str = ""
    itemKey: str = ""
    expectedHash: str | None = None


class StartRunRequest(BaseModel):
    """发起一次运行：引用那条 proposal 消息。"""

    messageId: str = Field(min_length=1)


@router.get("")
def list_workflows() -> dict[str, Any]:
    """列出已注册的 workflow 及其图版本摘要。"""
    return {"workflows": [_summary(item) for item in list_definitions()]}


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str) -> dict[str, Any]:
    """取一个 workflow 的完整图定义；未注册的 id 返回 404。"""
    try:
        definition = get_definition(workflow_id)
    except WorkflowNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {
        **definition.to_payload(),
        "version": definition.version,
        "contentHash": freeze_snapshot(workflow_id).content_hash,
    }


@router.get("/{workflow_id}/runs")
def list_runs(
    workflow_id: str,
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, list[dict[str, Any]]]:
    """列出该流程的 pipeline 历史，最近的运行在最前。"""
    return {"runs": list_workflow_runs(workflow_id=workflow_id, limit=limit)}


@router.get("/{workflow_id}/runs/{run_id}")
def get_run(workflow_id: str, run_id: str) -> dict[str, Any]:
    """取一次运行的详情：摘要、冻结的图与节点摘要。"""
    return _or_404(lambda: load_workflow_run(workflow_id=workflow_id, run_id=run_id))


@router.get("/{workflow_id}/runs/{run_id}/nodes")
def list_run_nodes(workflow_id: str, run_id: str) -> dict[str, Any]:
    """取一次运行的节点摘要列表。"""
    return _or_404(lambda: load_workflow_run_nodes(workflow_id=workflow_id, run_id=run_id))


@router.get("/{workflow_id}/runs/{run_id}/nodes/{node_id}/prompt-map")
def get_node_prompt_map(workflow_id: str, run_id: str, node_id: str) -> dict[str, Any]:
    """取某节点的提示词地图：待运行 / 运行中 / 已完成三态由它表达。"""
    return _or_404(lambda: load_prompt_map(workflow_id=workflow_id, run_id=run_id, node_id=node_id))


@router.post("/{workflow_id}/runs", status_code=201)
def create_run(
    workflow_id: str,
    request: StartRunRequest,
    executor: WorkflowExecutor = Depends(get_executor),
) -> dict[str, Any]:
    """发起一次运行：只有 `proposal` 消息能发起（口径 1）。

    未知流程 404；消息不存在 404；引用的消息不是 proposal 则 400 —— 这是请求本身
    不成立，而不是库里的运行状态冲突。
    """
    try:
        started = start_run(
            executor=executor,
            workflow_id=workflow_id,
            message_id=request.messageId,
        )
    except WorkflowNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except TriggerMessageNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ProposalRequiredError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {
        "workflowId": started.workflow_id,
        "runId": started.run_id,
        "messageId": started.message_id,
        "graphContentHash": started.graph_hash,
        **_progress(started.progress),
    }


@router.post("/{workflow_id}/runs/{run_id}/pause")
def pause_run(
    workflow_id: str,
    run_id: str,
    services: AppServices = Depends(get_services),
) -> dict[str, Any]:
    """暂停：执行器不再推进这个 run。暂停不落库，重启即失效。"""
    _or_404(lambda: load_workflow_run(workflow_id=workflow_id, run_id=run_id))
    services.workflow_executor.pause(run_id)
    return {"runId": run_id, "paused": True}


@router.post("/{workflow_id}/runs/{run_id}/resume")
def resume_run(
    workflow_id: str,
    run_id: str,
    executor: WorkflowExecutor = Depends(get_executor),
) -> dict[str, Any]:
    """继续：去掉暂停标记，并从库里最新的节点状态接着推进。"""
    _or_404(lambda: load_workflow_run(workflow_id=workflow_id, run_id=run_id))
    executor.resume(run_id)
    return _progress(executor.advance(workflow_id=workflow_id, run_id=run_id))


@router.post("/{workflow_id}/runs/{run_id}/nodes/{node_id}/rerun")
def rerun_node(
    workflow_id: str,
    run_id: str,
    node_id: str,
    executor: WorkflowExecutor = Depends(get_executor),
) -> dict[str, Any]:
    """从某节点重跑：该节点与全部下游进新代次，旧代次的产物留在库里可读。"""
    _or_404(lambda: load_workflow_run(workflow_id=workflow_id, run_id=run_id))
    try:
        affected = executor.rerun(workflow_id=workflow_id, run_id=run_id, node_id=node_id)
    except UnknownNodeError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {
        "nodeId": node_id,
        "affected": _instances(affected),
        **_progress(executor.advance(workflow_id=workflow_id, run_id=run_id)),
    }


@router.post("/{workflow_id}/runs/{run_id}/nodes/{node_id}/decide")
def decide_node(
    workflow_id: str,
    run_id: str,
    node_id: str,
    request: DecideRequest,
    executor: WorkflowExecutor = Depends(get_executor),
) -> dict[str, Any]:
    """人工决断：写一行评估产物并推进下游；版本冲突时 409 且不改动任何行。"""
    _or_404(lambda: load_workflow_run(workflow_id=workflow_id, run_id=run_id))
    try:
        executor.decide(
            workflow_id=workflow_id,
            run_id=run_id,
            node_id=node_id,
            approved=request.approved,
            item_key=request.itemKey,
            comments=request.comments,
            expected_hash=request.expectedHash,
        )
    except UnknownNodeError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except NodeExecutionError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"nodeId": node_id, **_progress(executor.advance(workflow_id=workflow_id, run_id=run_id))}


def _summary(item: Any) -> dict[str, Any]:
    """列表项：够前端选流程，不带完整的节点与连线。"""
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "version": item.version,
        "contentHash": freeze_snapshot(item.id).content_hash,
        "nodeCount": len(item.nodes),
        "edgeCount": len(item.edges),
    }


def _progress(progress: RunProgress) -> dict[str, Any]:
    """一次推进的结果：跑动了哪些实例、在等决断、失败，以及是否仍在暂停。"""
    return {
        "executed": _instances(progress.executed),
        "waiting": _instances(progress.waiting),
        "failed": _instances(progress.failed),
        "paused": progress.paused,
    }


def _instances(items: tuple[NodeInstance, ...]) -> list[dict[str, str]]:
    """实例列表：节点加条目，条目为空表示整节点。"""
    return [{"nodeId": item.node_id, "itemKey": item.item_key} for item in items]


def _or_404(load: Callable[[], T]) -> T:
    """未知流程、未知运行与未知节点都是 404：库里没有这份数据，重试也没用。"""
    try:
        return load()
    except WorkflowNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except UnknownNodeError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
