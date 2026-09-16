"""FastAPI 应用入口。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from teacheragent.api.routes import llm
from teacheragent.infrastructure.store import migrate
from teacheragent.services.llm import catalog, profiles
from teacheragent.config import env


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """启动时确保数据库 schema 就绪（迁移幂等，可重复执行）。"""
    migrate()
    catalog.refresh_models()
    profiles.ensure_default_profiles()
    yield


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
app.include_router(llm.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
