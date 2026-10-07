"""节点角色的默认能力实现。

先接一个：`outline-architect` 是当前唯一已有提示词资产的角色。其余角色的提示词资产
还没写，在这里注册实现属于后续任务；未注册的角色执行时直接报错，不静默跳过。
"""

from collections.abc import Mapping
from types import MappingProxyType
from typing import Any, Final, cast

from teacheragent.capabilities.llm.contracts import WorkflowCallOrigin
from teacheragent.capabilities.outline.messages import build_outline_messages
from teacheragent.capabilities.profile.contracts import StructuredProfile
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.llm.invoke import invoke_llm
from teacheragent.shared.json_parse import parse_json_object
from teacheragent.workflows.errors import NodeExecutionError
from teacheragent.workflows.execution.contracts import NodeExecution
from teacheragent.workflows.execution.nodes import RoleImplementation


def produce_outline(execution: NodeExecution, origin: WorkflowCallOrigin) -> Any:
    """按已确认的 brief 与当前画像渲染 outline 模板并调用模型，返回大纲正文。"""
    brief = execution.payload("brief")
    if not isinstance(brief, Mapping):
        raise NodeExecutionError(f"大纲节点缺少 LearningBrief 输入：{execution.node.id}")
    prompt_ref = execution.node.prompt_ref
    if prompt_ref is None:
        raise NodeExecutionError(f"大纲节点没有声明提示词资产：{execution.node.id}")
    messages = build_outline_messages(
        cast(Mapping[str, Any], brief),
        current_profile(),
        prompt_ref=prompt_ref,
    )
    response = invoke_llm(AgentRole.CURRICULUM, messages, origin=origin)
    try:
        return parse_json_object(str(response.content))
    except ValueError as error:
        raise NodeExecutionError(f"大纲节点的模型输出无法解析：{error}") from error


def current_profile() -> StructuredProfile:
    """当前结构化画像。

    画像 Markdown 的解析（`parse_profile_markdown`）还没接进执行器，这里返回空画像：
    各分区为 `None`，模板里对应内容为空。接进解析属于后续任务，在此之前不猜分区内容。
    """
    return StructuredProfile(version=3)


ROLE_IMPLEMENTATIONS: Final[Mapping[str, RoleImplementation]] = MappingProxyType({
    "outline-architect": produce_outline,
})
"""节点角色到能力实现的默认映射。"""
