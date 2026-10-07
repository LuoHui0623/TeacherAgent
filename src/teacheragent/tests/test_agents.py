"""Agent 契约：Tutor 的入口、图与工具装配，以及 Agent role 全集。"""

from langchain_core.language_models.fake_chat_models import FakeListChatModel

from teacheragent.agent.tutor import build_tutor_agent, tutor_tools
from teacheragent.constants import AgentRole


def test_role_set_contains_only_tutor_and_curriculum():
    assert [str(role) for role in AgentRole] == ["tutor", "curriculum"]


def test_tutor_registers_tools_and_builds_autonomous_graph():
    tools = tutor_tools()
    assert {tool.name for tool in tools} == {"get_learning_context", "search_knowledge_map"}

    graph = build_tutor_agent(FakeListChatModel(responses=["done"]), tools=tools)
    graph_nodes = set(graph.get_graph().nodes)
    assert "model" in graph_nodes
    assert "tools" in graph_nodes
