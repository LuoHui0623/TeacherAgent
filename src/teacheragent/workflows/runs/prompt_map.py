"""节点提示词地图：把一次节点运行摊成固定的六阶段。

三态由数据本身表达 —— 节点没有调用时只有模板阶段有内容（待填充模板 + 变量清单），
调用进行中时前五阶段已填充而输出阶段是 `streaming`，已完成时六阶段全为 `filled`。
模板阶段按 ref 现取当前文件正文并标注漂移，`runHash` 取自调用记录下的版本。
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from teacheragent.infrastructure.llm.prompts import Prompt, read_prompt
from teacheragent.workflows.contracts import Node
from teacheragent.workflows.execution.status import NodeRunStatus
from teacheragent.workflows.runs.contracts import (
    BindingItem,
    OutputData,
    PromptMap,
    PromptMapCall,
    RequestData,
    SourceItem,
    StageState,
    TemplateData,
    VariableBinding,
)
from teacheragent.workflows.runs.runs import (
    calls_by_node,
    incoming_artifacts,
    load_run_context,
    node_status,
    outgoing_artifacts,
)


def load_prompt_map(
    *,
    workflow_id: str,
    run_id: str,
    node_id: str,
) -> PromptMap:
    """取某节点在该次运行里的提示词地图；节点不属于该图时抛 `UnknownNodeError`。"""
    context = load_run_context(workflow_id=workflow_id, run_id=run_id)
    node = context.definition.node(node_id)
    calls = calls_by_node(context).get(node_id, [])
    template = _template_data(_read_asset(node), calls)
    return {
        "runId": context.run_id,
        "workflowId": context.workflow_id,
        "nodeId": node_id,
        "nodeStatus": str(node_status(context.node_rows(node_id))),
        "promptRef": node.prompt_ref,
        "template": template,
        "calls": [_call(row, template) for row in calls] or _planned_calls(node, template),
        "inputs": incoming_artifacts(context).get(node_id, []),
        "outputs": outgoing_artifacts(context).get(node_id, []),
    }


def _read_asset(node: Node) -> Prompt | None:
    """读节点声明的提示词资产；没声明或资产尚未编写时返回 None。"""
    if node.prompt_ref is None:
        return None
    try:
        return read_prompt(node.prompt_ref)
    except FileNotFoundError:
        return None


def _template_data(prompt: Prompt | None, calls: Sequence[Mapping[str, Any]]) -> TemplateData | None:
    """模板阶段的数据：当前文件正文、变量清单、变量绑定与本次运行所用版本的漂移。"""
    if prompt is None:
        return None
    run_hash = next(
        (row["prompt_content_hash"] for row in reversed(list(calls)) if row["prompt_content_hash"]),
        None,
    )
    return {
        "ref": prompt.ref,
        "currentHash": prompt.content_hash,
        "runHash": run_hash,
        "changed": run_hash is not None and run_hash != prompt.content_hash,
        "variables": list(prompt.variables),
        "bindings": _variable_bindings(prompt, calls),
        "template": prompt.content,
        "staticPrefix": prompt.static_prefix,
        "injection": prompt.injection,
    }


def _variable_bindings(
    prompt: Prompt,
    calls: Sequence[Mapping[str, Any]],
) -> list[VariableBinding]:
    """模板声明的每个变量由什么填充。

    变量名与输入端口同名时能对上那份产物版本；没有同名端口而调用确实发生过，说明值
    来自平台上下文 —— 「这一版没绑定」与「不由产物填充」是两件事，不混为一谈。
    """
    recorded = _bindings(calls[-1]) if calls else []
    by_port = {item["portId"]: item for item in recorded}
    return [
        {
            "name": name,
            "state": "bound" if calls else "pending",
            "portId": item["portId"] if (item := by_port.get(name)) else None,
            "nodeId": item["nodeId"] if item else None,
            "itemKey": item["itemKey"] if item else None,
            "contentHash": item["contentHash"] if item else None,
        }
        for name in prompt.variables
    ]


def _planned_calls(node: Node, template: TemplateData | None) -> list[PromptMapCall]:
    """节点还没有调用时给出一次预期调用：只有模板阶段有内容，其余待发生。"""
    if template is None:
        return []
    return [
        {
            "callId": None,
            "sequence": 1,
            "attempt": 1,
            "itemKey": "",
            "generation": 0,
            "role": node.role_id or "",
            "status": str(NodeRunStatus.PENDING),
            "stages": [
                {"kind": "template", "state": "pending", "data": template},
                {"kind": "sources", "state": "pending", "data": None},
                {"kind": "context", "state": "pending", "data": None},
                {"kind": "messages", "state": "pending", "data": None},
                {"kind": "request", "state": "pending", "data": None},
                {"kind": "output", "state": "pending", "data": None},
            ],
        }
    ]


def _call(row: Mapping[str, Any], template: TemplateData | None) -> PromptMapCall:
    """一次真实调用：六阶段按这一行的记录逐个填充。"""
    sources = _sources(row)
    bindings = _bindings(row)
    messages = _messages(row)
    output_state = _output_state(str(row["status"]))
    return {
        "callId": str(row["run_id"]),
        "sequence": int(row["sequence"]),
        "attempt": int(row["attempt"]),
        "itemKey": str(row["item_key"] or ""),
        "generation": int(row["generation"] or 0),
        "role": str(row["role"]),
        "status": str(row["status"]),
        "stages": [
            {
                "kind": "template",
                "state": "filled" if template else "pending",
                "data": template,
            },
            {
                "kind": "sources",
                "state": "filled" if sources else "pending",
                "data": sources or None,
            },
            {
                "kind": "context",
                "state": "filled" if bindings else "pending",
                "data": bindings or None,
            },
            {
                "kind": "messages",
                "state": "filled" if messages else "pending",
                "data": messages or None,
            },
            {"kind": "request", "state": "filled", "data": _request_data(row)},
            {
                "kind": "output",
                "state": output_state,
                "data": None if output_state == "streaming" else _output_data(row),
            },
        ],
    }


def _sources(row: Mapping[str, Any]) -> list[SourceItem]:
    """这次调用用到的提示词资产片段，来自落库的 `prompt_sources_json`。"""
    return [
        {
            "ref": _text(source, "ref"),
            "name": _optional_text(source, "name"),
            "order": _int(source, "order"),
            "role": _text(source, "role"),
            "contentHash": _text(source, "content_hash"),
            "templateText": _text(source, "template_text"),
            "renderedText": _text(source, "rendered_text"),
        }
        for source in _objects(_json_value(row["prompt_sources_json"]))
    ]


def _bindings(row: Mapping[str, Any]) -> list[BindingItem]:
    """这次调用读到的产物版本，按输入端口摊平。"""
    return [
        {
            "portId": port_id,
            "nodeId": _text(item, "node_id"),
            "itemKey": _text(item, "item_key"),
            "contentHash": _text(item, "content_hash"),
        }
        for port_id, recorded in _object(_json_value(row["bindings_json"])).items()
        for item in _objects(recorded)
    ]


def _messages(row: Mapping[str, Any]) -> list[dict[str, Any]]:
    """真正发往 provider 的消息。"""
    return _objects(_json_value(row["input_messages_json"]))


def _request_data(row: Mapping[str, Any]) -> RequestData:
    """提交给 provider 的调用参数。"""
    return {
        "provider": str(row["provider"]),
        "model": str(row["model"]),
        "role": str(row["role"]),
        "temperature": float(row["temperature"]),
        "attempt": int(row["attempt"]),
        "startedAt": str(row["started_at"]),
    }


def _output_data(row: Mapping[str, Any]) -> OutputData:
    """这次调用的结果。"""
    message = _object(_json_value(row["output_message_json"]))
    return {
        "message": message or None,
        "promptTokens": int(row["prompt_tokens"]),
        "completionTokens": int(row["completion_tokens"]),
        "totalTokens": int(row["total_tokens"]),
        "durationMs": int(row["duration_ms"]),
        "completedAt": str(row["completed_at"]),
        "error": str(row["error"]),
    }


def _output_state(status: str) -> StageState:
    """输出阶段的状态由调用状态决定。"""
    if status == "running":
        return "streaming"
    if status in ("error", "cancelled"):
        return "failed"
    return "filled"


def _text(payload: Mapping[str, Any], key: str) -> str:
    """对象里的字符串字段；缺失或不是字符串时取空串。"""
    value = payload.get(key)
    return value if isinstance(value, str) else ""


def _optional_text(payload: Mapping[str, Any], key: str) -> str | None:
    """对象里的可选字符串字段。"""
    value = payload.get(key)
    return value if isinstance(value, str) else None


def _int(payload: Mapping[str, Any], key: str) -> int:
    """对象里的整数字段；缺失或不是整数时取 0。"""
    value = payload.get(key)
    return value if isinstance(value, int) else 0


def _object(value: Any) -> dict[str, Any]:
    """已解析的 JSON 值里的对象；不是对象时按空对象处理。"""
    return value if isinstance(value, dict) else {}


def _objects(value: Any) -> list[dict[str, Any]]:
    """已解析的 JSON 值里的对象数组；不是数组或元素不是对象时按空数组处理。"""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _json_value(raw: Any) -> Any:
    """落库的 JSON 文本解析成 Python 值；空值与解析失败时返回 None。

    返回 `Any` 是因为 JSON 的形状在这里不做假设：`_object` / `_objects` 负责收窄，
    取值助手负责按字段定型。库里一行坏数据不该让整张地图不可读，所以不报错。
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None
