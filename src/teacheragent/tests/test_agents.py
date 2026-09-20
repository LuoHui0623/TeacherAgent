"""T11 Agent 契约：两类 Agent 的入口、图和工具装配。"""

from langchain_core.language_models.fake_chat_models import FakeListChatModel

from teacheragent.agent.curriculum import build_curriculum_graph, run_curriculum
from teacheragent.agent.tutor import build_tutor_agent, tutor_tools
from teacheragent.constants import AgentRole


def test_role_set_contains_only_tutor_and_curriculum():
    assert [str(role) for role in AgentRole] == ["tutor", "curriculum"]


def test_curriculum_graph_runs_plan_and_validate_nodes():
    graph = build_curriculum_graph()
    state = graph.invoke({"learning_goal": "学习 Python 类型系统"})

    assert state["status"] == "validated"
    assert state["validation_errors"] == []
    assert state["outline"]["title"] == "学习 Python 类型系统"
    assert {name for name in graph.get_graph().nodes} >= {"__start__", "plan", "validate", "__end__"}


def test_curriculum_run_reports_invalid_input():
    state = run_curriculum("")

    assert state["status"] == "invalid"
    assert "learning_goal 不能为空" in state["validation_errors"]


def test_tutor_registers_tools_and_builds_autonomous_graph():
    tools = tutor_tools()
    assert {tool.name for tool in tools} == {"get_learning_context", "search_knowledge_map"}

    graph = build_tutor_agent(FakeListChatModel(responses=["done"]), tools=tools)
    graph_nodes = set(graph.get_graph().nodes)
    assert "model" in graph_nodes
    assert "tools" in graph_nodes
