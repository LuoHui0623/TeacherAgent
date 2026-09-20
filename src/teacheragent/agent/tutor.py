"""Tutor Agent：基于 LangChain tool calling 的自主决策入口。"""

from collections.abc import Iterable
from typing import Any

from langchain.agents import create_agent
from langchain_core.tools import BaseTool, tool

from teacheragent.infrastructure.llm.prompts import load_prompt


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
):
    """构建可自主决定是否调用工具的 Tutor LangGraph。"""
    selected_tools = tuple(tools) if tools is not None else tutor_tools()
    prompt = load_prompt("agent/prompts/tutor.md").content
    return create_agent(
        model=model,
        tools=selected_tools,
        system_prompt=prompt,
        name="tutor",
    )
