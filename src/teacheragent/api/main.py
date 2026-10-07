"""FastAPI 应用入口。"""

from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from typing import Any, cast

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from teacheragent.api.routes import chat, llm, llm_runs, prompts, user_profile, workflows
from teacheragent.api.services import AppServices, SERVICES_ATTRIBUTE
from teacheragent.infrastructure.store import migrate
from teacheragent.infrastructure.llm.runtime import LlmRuntime, set_llm_runtime
from teacheragent.services.llm import catalog, profiles
from teacheragent.workflows.execution import WorkflowExecutor
from teacheragent.config import env


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """初始化数据库和进程级 LLM 运行时，并在关闭时排空请求。"""
    migrate()
    refresh_models = cast(
        Callable[[], dict[str, Any]],
        getattr(catalog, "refresh_models"),
    )
    refresh_models()
    profiles.ensure_default_profiles()
    runtime = LlmRuntime()
    executor = WorkflowExecutor()
    setattr(
        application.state,
        SERVICES_ATTRIBUTE,
        AppServices(llm_runtime=runtime, workflow_executor=executor),
    )
    set_llm_runtime(runtime)
    _resume_interrupted_runs(executor)
    try:
        yield
    finally:
        runtime.close()


def _resume_interrupted_runs(executor: WorkflowExecutor) -> None:
    """启动恢复扫描：非终态的行重新纳入调度，并接着推进受影响的 run（口径 E）。"""
    for workflow_id, run_id in executor.recover():
        executor.advance(workflow_id=workflow_id, run_id=run_id)


app = FastAPI(title="TeacherAgent API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        item.strip()
        for item in env.get_env(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:3055,http://127.0.0.1:3055",
        ).split(",")
        if item.strip()
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
app.include_router(chat.router)
app.include_router(llm.router)
app.include_router(llm_runs.router)
app.include_router(prompts.router)
app.include_router(user_profile.router)
app.include_router(workflows.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
