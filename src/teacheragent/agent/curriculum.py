"""Curriculum Agent：最小可运行的 LangGraph 课程设计工作流。"""

from collections.abc import Callable
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph


class CurriculumState(TypedDict, total=False):
    """课程设计图的状态，不包含运行 ID 或节点关联信息。"""

    learning_goal: str
    context: dict[str, Any]
    outline: dict[str, Any]
    validation_errors: list[str]
    status: str


Planner = Callable[[CurriculumState], dict[str, Any]]
Validator = Callable[[CurriculumState], list[str]]


def _default_planner(state: CurriculumState) -> dict[str, Any]:
    goal = state.get("learning_goal", "").strip()
    return {
        "outline": {
            "title": goal or "待确认的学习目标",
            "learning_goal": goal,
            "context": state.get("context", {}),
            "sections": [],
        },
        "status": "planned",
    }


def _default_validator(state: CurriculumState) -> list[str]:
    outline = state.get("outline") or {}
    errors: list[str] = []
    if not state.get("learning_goal", "").strip():
        errors.append("learning_goal 不能为空")
    if not outline.get("title"):
        errors.append("outline.title 不能为空")
    return errors


def build_curriculum_graph(
    *,
    planner: Planner | None = None,
    validator: Validator | None = None,
):
    """构建并编译课程设计图；规划器和校验器可由真实 Agent 注入。"""
    plan = planner or _default_planner
    validate = validator or _default_validator

    graph = StateGraph(CurriculumState)
    graph.add_node("plan", plan)
    def validate_node(state: CurriculumState) -> dict[str, Any]:
        errors = validate(state)
        return {"validation_errors": errors, "status": "validated" if not errors else "invalid"}

    graph.add_node("validate", validate_node)
    graph.add_edge(START, "plan")
    graph.add_edge("plan", "validate")
    graph.add_edge("validate", END)
    return graph.compile()


def run_curriculum(
    learning_goal: str,
    *,
    context: dict[str, Any] | None = None,
    planner: Planner | None = None,
    validator: Validator | None = None,
) -> CurriculumState:
    """执行一次课程设计图，返回可供后续 Contract 校验的状态。"""
    graph = build_curriculum_graph(planner=planner, validator=validator)
    return graph.invoke({
        "learning_goal": learning_goal,
        "context": context or {},
    })


