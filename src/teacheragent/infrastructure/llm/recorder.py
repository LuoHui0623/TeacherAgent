"""真实 LLM 请求的 running/success/error 生命周期记录。"""

import time
import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from teacheragent.capabilities.llm.contracts import LlmRequestContext, WorkflowCallOrigin
from teacheragent.infrastructure.store import repositories


class RunRecorder:
    """把一次不可变请求上下文记录为平铺的 `llm_runs` 行。"""

    @contextmanager
    def record(
        self,
        request: LlmRequestContext,
        *,
        role: str,
        provider: str,
        model: str,
        temperature: float,
        origin: WorkflowCallOrigin | None = None,
    ) -> Iterator["RunHandle"]:
        """创建 running 记录，并在退出时写入成功或错误结果。

        `origin` 说明这次调用属于哪个节点实例；非 workflow 调用不传，相关列为 NULL。
        """
        started = time.perf_counter()
        started_at = _now()
        repositories.llm_runs.create_run(
            run={
                "run_id": str(request.run_id),
                "task_id": str(request.task_id),
                "query_id": str(request.query_id),
                "sequence": request.sequence,
                "attempt": request.attempt,
                "role": role,
                "provider": provider,
                "model": model,
                "temperature": temperature,
                "prompt_sources": [source.model_dump() for source in request.llm_messages.sources],
                "input_messages": request.llm_messages.messages,
                "tools": request.llm_messages.tools,
                "started_at": started_at,
                "origin": origin,
            }
        )
        handle = RunHandle()
        try:
            yield handle
        except BaseException as exc:
            repositories.llm_runs.finish_run(
                run_id=str(request.run_id),
                values={
                    "status": "cancelled" if isinstance(exc, (GeneratorExit, asyncio.CancelledError)) else "error",
                    "error": str(exc),
                    "completed_at": _now(),
                    "duration_ms": _duration(started),
                },
            )
            raise
        else:
            repositories.llm_runs.finish_run(
                run_id=str(request.run_id),
                values={
                    "status": "success",
                    "output_message": handle.output_message,
                    **handle.usage,
                    "completed_at": _now(),
                    "duration_ms": _duration(started),
                },
            )


class RunHandle:
    """调用过程中由 LlmModel 填充的结果字段。"""

    def __init__(self) -> None:
        self.output_message: dict[str, Any] | None = None
        self.usage: dict[str, int] = {}


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _duration(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)