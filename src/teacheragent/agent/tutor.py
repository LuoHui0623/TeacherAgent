"""Tutor Agent：基于 LangChain tool calling 的自主决策入口。"""

from collections.abc import Iterable
from typing import Any

from langchain.agents import create_agent
from langchain_core.tools import BaseTool, tool

from teacheragent.capabilities.llm.contracts import PromptTrace
from teacheragent.infrastructure.llm.model import TracedChatModel
from teacheragent.infrastructure.llm.prompts import load_prompt
from teacheragent.infrastructure.llm.runtime import TaskRuntimeContext, get_llm_runtime
from teacheragent.infrastructure.llm.settings import get_settings


@tool
def get_learning_context(topic: str) -> str:
    """返回与指定主题相关的学习上下文摘要，供 Tutor 决定下一步行动。"""
    topic = topic.strip()
    return f"暂无已持久化的学习上下文：{topic or '未指定主题'}"


@tool
def search_knowledge_map(query: str) -> str:
    """查询知识地图中的相关概念；当前返回可替换的能力层查询边界。"""
    query = query.strip()
    return f"知识地图查询已登记：{query or '未指定查询词'}"


def tutor_tools() -> tuple[BaseTool, ...]:
    """Tutor 当前实际装配的工具集合。"""
    return get_learning_context, search_knowledge_map


def build_tutor_agent(
    model: Any,
    *,
    tools: Iterable[BaseTool] | None = None,
    task_context: TaskRuntimeContext | None = None,
):
    """构建可自主决定是否调用工具的 Tutor LangGraph。"""
    selected_tools = tuple(tools) if tools is not None else tutor_tools()
    prompt_asset = load_prompt("agent/prompts/tutor.md")
    prompt = prompt_asset.content
    if task_context is not None:
        prompt_trace = PromptTrace(
            sources=[{
                "ref": prompt_asset.ref,
                "content_hash": prompt_asset.content_hash,
                "name": "tutor",
                "order": 0,
                "role": "system",
                "template_text": prompt_asset.content,
                "rendered_text": prompt_asset.content,
            }],
            template_text=prompt_asset.content,
            messages=[{"role": "system", "content": prompt}],
        )
        settings = get_settings(task_context.role)
        model = TracedChatModel(
            wrapped=model,
            runtime=get_llm_runtime(),
            settings=settings,
            prompt_trace=prompt_trace,
            default_context=task_context,
        )
    return create_agent(
        model=model,
        tools=selected_tools,
        system_prompt=prompt,
        name="tutor",
    )
