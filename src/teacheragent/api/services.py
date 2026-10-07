"""应用级共享服务容器与 FastAPI 依赖。

服务在 `lifespan` 中挂到应用状态上，路由通过 `Depends` 取用，因此测试或
需要替换实现的场景可以用 `app.dependency_overrides` 覆盖，不必改路由。
新增共享服务时只扩展 `AppServices` 的字段，不引入新的状态属性名。
"""

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

from teacheragent.infrastructure.llm.runtime import LlmRuntime
from teacheragent.workflows.execution import WorkflowExecutor


SERVICES_ATTRIBUTE = "services"
"""应用状态上挂载 `AppServices` 的属性名。"""


@dataclass(frozen=True)
class AppServices:
    """应用级共享服务集合。"""

    llm_runtime: LlmRuntime
    workflow_executor: WorkflowExecutor


def get_services(request: Request) -> AppServices:
    """读取应用挂载的服务集合；尚未初始化时返回 503。"""
    services = getattr(request.app.state, SERVICES_ATTRIBUTE, None)
    if not isinstance(services, AppServices):
        raise HTTPException(status_code=503, detail="application services are unavailable")
    return services


def get_runtime(services: AppServices = Depends(get_services)) -> LlmRuntime:
    """返回共享 LLM 运行时。"""
    return services.llm_runtime


def get_executor(services: AppServices = Depends(get_services)) -> WorkflowExecutor:
    """返回共享的执行器：暂停标记是它的内存状态，控制动作必须落在同一个实例上。"""
    return services.workflow_executor
