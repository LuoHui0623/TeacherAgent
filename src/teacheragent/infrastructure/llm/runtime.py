"""共享 LLM 运行时、任务上下文和按路由的并发控制。"""

from collections.abc import Callable, Generator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime
from threading import BoundedSemaphore, Condition, Lock
from typing import Any
from uuid import UUID, uuid4

from teacheragent.shared.llm_contracts import LlmRequestContext, PromptTrace
from teacheragent.config.llm import LlmSettings


def _empty_metadata() -> dict[str, Any]:
    return {}


@dataclass(frozen=True, slots=True)
class TaskRuntimeContext:
    """一次业务任务内保持稳定的调用上下文。"""

    role: str
    task_id: UUID = field(default_factory=uuid4)
    query_id: UUID = field(default_factory=uuid4)
    session_id: UUID | None = None
    deadline: datetime | None = None
    metadata: Mapping[str, Any] = field(default_factory=_empty_metadata)

    def new_request(
        self,
        prompt_trace: PromptTrace,
        *,
        sequence: int,
        attempt: int = 1,
    ) -> "LlmRequestContext":
        """为一次真实 provider 请求创建独立上下文。"""
        if sequence < 1:
            raise ValueError("sequence must be greater than zero")
        if attempt < 1:
            raise ValueError("attempt must be greater than zero")
        return LlmRequestContext(
            task_id=self.task_id,
            query_id=self.query_id,
            run_id=uuid4(),
            sequence=sequence,
            attempt=attempt,
            prompt_trace=prompt_trace,
        )


class LlmRuntime:
    """共享模型运行时；按 provider/model 路由限制并发请求数。"""

    def __init__(
        self,
        *,
        default_limit: int = 1,
        route_limits: Mapping[tuple[str, str], int] | None = None,
    ) -> None:
        if default_limit < 1:
            raise ValueError("default_limit must be greater than zero")
        self._default_limit = default_limit
        self._route_limits = dict(route_limits or {})
        self._semaphores: dict[tuple[str, str], BoundedSemaphore] = {}
        self._models: dict[tuple[str, str, float, int], Any] = {}
        self._lock = Lock()
        self._condition = Condition(self._lock)
        self._active_requests = 0
        self._closed = False

    def get_model(
        self,
        settings: LlmSettings,
        factory: Callable[[LlmSettings], Any],
    ) -> Any:
        """按不可变配置快照复用模型；配置变化会使用新的模型实例。"""
        key = (
            settings["provider"],
            settings["model"],
            settings["temperature"],
            id(factory),
        )
        with self._lock:
            model = self._models.get(key)
            if model is None:
                model = factory(settings)
                self._models[key] = model
            return model

    def new_request(
        self,
        task_context: TaskRuntimeContext,
        prompt_trace: PromptTrace,
        *,
        sequence: int,
        attempt: int = 1,
    ) -> LlmRequestContext:
        """从任务上下文创建一次新的真实请求上下文。"""
        return task_context.new_request(
            prompt_trace,
            sequence=sequence,
            attempt=attempt,
        )

    @contextmanager
    def acquire(self, settings: LlmSettings) -> Generator[None, None, None]:
        """占用一次 provider 请求许可，并在退出时释放。"""
        route = (settings["provider"], settings["model"])
        with self._condition:
            if self._closed:
                raise RuntimeError("LLM runtime is closed")
            semaphore = self._semaphore_for(route)
            self._active_requests += 1
        semaphore.acquire()
        try:
            yield
        finally:
            semaphore.release()
            with self._condition:
                self._active_requests -= 1
                self._condition.notify_all()

    def update_route_limit(self, route: tuple[str, str], limit: int) -> None:
        """为后续请求替换路由限流器，不影响已获取旧许可的请求。"""
        if limit < 1:
            raise ValueError("route limit must be greater than zero")
        with self._condition:
            if self._closed:
                raise RuntimeError("LLM runtime is closed")
            self._route_limits[route] = limit
            self._semaphores[route] = BoundedSemaphore(limit)

    def close(self) -> None:
        """停止新请求，并等待已进入运行时的请求退出。"""
        with self._condition:
            self._closed = True
            while self._active_requests:
                self._condition.wait()

    @property
    def is_closed(self) -> bool:
        """当前运行时是否已停止接收请求。"""
        with self._lock:
            return self._closed

    def _semaphore_for(self, route: tuple[str, str]) -> BoundedSemaphore:
        semaphore = self._semaphores.get(route)
        if semaphore is None:
            limit = self._route_limits.get(route, self._default_limit)
            if limit < 1:
                raise ValueError("route limit must be greater than zero")
            semaphore = BoundedSemaphore(limit)
            self._semaphores[route] = semaphore
        return semaphore


@dataclass
class _RuntimeHolder:
    current: LlmRuntime


_runtime_holder = _RuntimeHolder(LlmRuntime())


def get_llm_runtime() -> LlmRuntime:
    """返回应用级共享 LLM 运行时。"""
    if _runtime_holder.current.is_closed:
        _runtime_holder.current = LlmRuntime()
    return _runtime_holder.current


def set_llm_runtime(runtime: LlmRuntime) -> None:
    """替换进程级运行时，供应用生命周期和测试注入。"""
    _runtime_holder.current = runtime