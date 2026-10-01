"""共享 LLM 运行时、任务上下文和按路由限流。"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from threading import Condition, Lock
from typing import Any
from uuid import UUID, uuid4

from teacheragent.capabilities.llm.contracts import LlmMessages, LlmRequestContext
from teacheragent.config.llm import LlmSettings
from teacheragent.infrastructure.llm.limiter import LimiterStats, RouteLimiter


def _empty_metadata() -> dict[str, Any]:
    return {}


class _Counter:
    """单调计数器；`sequence` 与 `attempt` 各自由其所属单位独占分配。"""

    def __init__(self) -> None:
        self._lock = Lock()
        self._value = 0

    def next(self) -> int:
        with self._lock:
            self._value += 1
            return self._value


@dataclass(frozen=True, slots=True)
class PendingRequest:
    """一次逻辑请求：`sequence` 已固定，`attempt` 由重试逐次分配。"""

    task_id: UUID
    query_id: UUID
    sequence: int
    llm_messages: LlmMessages
    _attempts: _Counter = field(default_factory=_Counter, init=False, repr=False, compare=False)

    def next_attempt(self) -> LlmRequestContext:
        """分配下一次尝试；每次尝试都有独立的 `run_id` 与递增的 `attempt`。"""
        return LlmRequestContext(
            task_id=self.task_id,
            query_id=self.query_id,
            run_id=uuid4(),
            sequence=self.sequence,
            attempt=self._attempts.next(),
            llm_messages=self.llm_messages,
        )


@dataclass(frozen=True, slots=True)
class TaskRuntimeContext:
    """一次业务任务内保持稳定的调用上下文。"""

    role: str
    task_id: UUID = field(default_factory=uuid4)
    query_id: UUID = field(default_factory=uuid4)
    session_id: UUID | None = None
    deadline: datetime | None = None
    metadata: Mapping[str, Any] = field(default_factory=_empty_metadata)
    _sequence: _Counter = field(default_factory=_Counter, init=False, repr=False, compare=False)

    def new_request(self, llm_messages: LlmMessages) -> PendingRequest:
        """登记一次逻辑请求；`sequence` 由本上下文按调用顺序分配。"""
        return PendingRequest(
            task_id=self.task_id,
            query_id=self.query_id,
            sequence=self._sequence.next(),
            llm_messages=llm_messages,
        )


class LlmRuntime:
    """共享模型运行时：模型实例缓存与按路由限流。"""

    def __init__(
        self,
        *,
        default_limit: int = 1,
        default_requests_per_second: float = 0,
        route_limits: Mapping[tuple[str, str], int] | None = None,
    ) -> None:
        if default_limit < 1:
            raise ValueError("default_limit must be greater than zero")
        self._default_limit = default_limit
        self._default_rate = default_requests_per_second
        self._route_limits = dict(route_limits or {})
        self._route_rates: dict[tuple[str, str], float] = {}
        self._limiters: dict[tuple[str, str], RouteLimiter] = {}
        self._models: dict[tuple[str, str, float, int], Any] = {}
        self._lock = Lock()
        self._condition = Condition(self._lock)
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

    def new_request(self, task_context: TaskRuntimeContext, llm_messages: LlmMessages) -> PendingRequest:
        """从任务上下文登记一次逻辑请求。"""
        return task_context.new_request(llm_messages)

    def limiter_for(self, settings: LlmSettings) -> RouteLimiter:
        """返回该路由当前的限流器；运行时改限对后续请求立即生效。"""
        route = (settings["provider"], settings["model"])
        with self._condition:
            if self._closed:
                raise RuntimeError("LLM runtime is closed")
            limiter = self._limiters.get(route)
            if limiter is None:
                limiter = self._build_limiter(route)
                self._limiters[route] = limiter
            return limiter

    def update_route_limit(
        self,
        route: tuple[str, str],
        limit: int,
        *,
        requests_per_second: float | None = None,
    ) -> None:
        """为后续请求替换路由限流器，不影响已持有旧许可的请求。"""
        if limit < 1:
            raise ValueError("route limit must be greater than zero")
        with self._condition:
            if self._closed:
                raise RuntimeError("LLM runtime is closed")
            self._route_limits[route] = limit
            if requests_per_second is not None:
                self._route_rates[route] = requests_per_second
            self._limiters[route] = self._build_limiter(route)

    def limiter_stats(self) -> tuple[LimiterStats, ...]:
        """返回所有已建立路由的限流快照。"""
        with self._condition:
            limiters = tuple(self._limiters.values())
        return tuple(limiter.stats() for limiter in limiters)

    def close(self) -> None:
        """停止新请求，并等待已进入运行时的请求退出。"""
        with self._condition:
            self._closed = True
            while any(limiter.in_flight for limiter in self._limiters.values()):
                self._condition.wait()

    @property
    def is_closed(self) -> bool:
        """当前运行时是否已停止接收请求。"""
        with self._lock:
            return self._closed

    def _build_limiter(self, route: tuple[str, str]) -> RouteLimiter:
        return RouteLimiter(
            provider=route[0],
            model=route[1],
            limit=self._route_limits.get(route, self._default_limit),
            requests_per_second=self._route_rates.get(route, self._default_rate),
            on_change=self._notify,
        )

    def _notify(self) -> None:
        """限流器状态变化时唤醒等待关闭的调用方。"""
        with self._condition:
            self._condition.notify_all()


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