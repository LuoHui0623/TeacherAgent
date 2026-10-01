"""按 provider/model 路由的限流：并发许可与可选 RPS 令牌。"""

import asyncio
import threading
from collections.abc import AsyncGenerator, Callable, Generator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass

from langchain_core.rate_limiters import InMemoryRateLimiter


@dataclass(frozen=True, slots=True)
class LimiterStats:
    """某路由的限流快照。"""

    provider: str
    model: str
    limit: int
    in_flight: int
    waiting: int
    requests_per_second: float


class RouteLimiter:
    """单路由限流器：并发许可加可选 RPS 令牌。

    `BaseRateLimiter` 只声明 `acquire` / `aacquire`，没有释放入口，无法表达
    「持有—释放」成对的并发上限，因此并发许可在此独立实现；RPS 令牌复用
    LangChain 的 `InMemoryRateLimiter`。同步与异步共用同一许可池，异步等待
    在线程中完成，不阻塞事件循环。
    """

    def __init__(
        self,
        *,
        provider: str,
        model: str,
        limit: int,
        requests_per_second: float = 0,
        on_change: Callable[[], None] | None = None,
    ) -> None:
        if limit < 1:
            raise ValueError("route limit must be greater than zero")
        self._provider = provider
        self._model = model
        self._limit = limit
        self._requests_per_second = requests_per_second
        self._permits = threading.BoundedSemaphore(limit)
        self._tokens = (
            InMemoryRateLimiter(requests_per_second=requests_per_second)
            if requests_per_second > 0
            else None
        )
        self._state = threading.Lock()
        self._in_flight = 0
        self._waiting = 0
        self._on_change = on_change

    @contextmanager
    def acquire(self) -> Generator[None]:
        """同步占用一次许可，退出时释放。"""
        self._enter_waiting()
        try:
            self._permits.acquire()
        finally:
            self._leave_waiting()
        self._enter_in_flight()
        try:
            if self._tokens is not None:
                self._tokens.acquire(blocking=True)
            yield
        finally:
            self._leave_in_flight()
            self._permits.release()

    @asynccontextmanager
    async def aacquire(self) -> AsyncGenerator[None]:
        """异步占用一次许可，退出时释放；等待期间不阻塞事件循环。"""
        self._enter_waiting()
        try:
            await asyncio.to_thread(self._permits.acquire)
        finally:
            self._leave_waiting()
        self._enter_in_flight()
        try:
            if self._tokens is not None:
                await self._tokens.aacquire(blocking=True)
            yield
        finally:
            self._leave_in_flight()
            self._permits.release()

    @property
    def in_flight(self) -> int:
        """当前持有许可的请求数。"""
        with self._state:
            return self._in_flight

    def stats(self) -> LimiterStats:
        """返回该路由的限流快照。"""
        with self._state:
            in_flight, waiting = self._in_flight, self._waiting
        return LimiterStats(
            provider=self._provider,
            model=self._model,
            limit=self._limit,
            in_flight=in_flight,
            waiting=waiting,
            requests_per_second=self._requests_per_second,
        )

    def _enter_waiting(self) -> None:
        with self._state:
            self._waiting += 1
        self._notify()

    def _leave_waiting(self) -> None:
        with self._state:
            self._waiting -= 1
        self._notify()

    def _enter_in_flight(self) -> None:
        with self._state:
            self._in_flight += 1
        self._notify()

    def _leave_in_flight(self) -> None:
        with self._state:
            self._in_flight -= 1
        self._notify()

    def _notify(self) -> None:
        if self._on_change is not None:
            self._on_change()
