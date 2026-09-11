"""FastAPI 应用入口。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from teacheragent.store import migrate


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """启动时确保数据库 schema 就绪（迁移幂等，可重复执行）。"""
    migrate()
    yield


app = FastAPI(title="TeacherAgent API", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
