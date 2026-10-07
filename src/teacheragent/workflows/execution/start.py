"""由一条 proposal 消息发起一次运行。

发起面只有一处：Tutor 对话里的 proposal（口径 1）。因此这里先认这条消息 —— 它必须存在
且类别是 `proposal` —— 再按新编号开一次运行：冻结图快照、把那条消息作为入口节点捕获的
事件写下来、推进到跑不动为止。run 与消息的关联落在 `node_runs.trigger_message_id`，
所以「哪条 proposal 触发了这次运行」不需要额外的表。
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from teacheragent.constants import PROPOSAL_TYPE
from teacheragent.infrastructure.store.sqlite.repositories import chat_messages as message_repo
from teacheragent.infrastructure.store.sqlite.repositories import node_runs as run_repo
from teacheragent.shared.sequence import next_sequence_id
from teacheragent.workflows.errors import (
    ProposalRequiredError,
    TriggerMessageNotFoundError,
)
from teacheragent.workflows.execution.scheduler import RunProgress, WorkflowExecutor
from teacheragent.workflows.registry import get_definition


RUN_ID_PREFIX = "run"
"""run id 前缀；编号在该流程内递增。"""


@dataclass(frozen=True, slots=True)
class StartedRun:
    """一次新开运行的结果：身份、图版本与第一轮推进。"""

    workflow_id: str
    run_id: str
    message_id: str
    graph_hash: str
    progress: RunProgress


def start_run(
    *,
    executor: WorkflowExecutor,
    workflow_id: str,
    message_id: str,
    at: datetime | None = None,
) -> StartedRun:
    """由 `message_id` 那条 proposal 发起一次运行并推进一次。

    消息不存在、或类别不是 `proposal` 时拒绝发起；图定义未注册时由注册表抛出。
    """
    get_definition(workflow_id)
    message = message_repo.get_message(message_id=message_id)
    if message is None:
        raise TriggerMessageNotFoundError(f"发起运行的消息不存在：{message_id}")
    if message["type"] != PROPOSAL_TYPE:
        raise ProposalRequiredError(
            f"只有 {PROPOSAL_TYPE} 消息能发起运行，{message_id} 是 {message['type']}"
        )
    run_id = next_sequence_id(run_repo.list_run_ids(workflow_id=workflow_id), RUN_ID_PREFIX)
    graph_hash = executor.open_run(
        workflow_id=workflow_id,
        run_id=run_id,
        trigger_message_id=message_id,
        events=(_event(message),),
        at=at,
    )
    return StartedRun(
        workflow_id=workflow_id,
        run_id=run_id,
        message_id=message_id,
        graph_hash=graph_hash,
        progress=executor.advance(workflow_id=workflow_id, run_id=run_id),
    )


def _event(message: Mapping[str, Any]) -> dict[str, Any]:
    """入口节点捕获的事件就是那条发起消息本身。"""
    return {
        "type": PROPOSAL_TYPE,
        "messageId": str(message["message_id"]),
        "content": str(message["content"]),
        "occurredAt": str(message["event_time"]),
    }
