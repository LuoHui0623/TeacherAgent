"""共享 LLM 运行时的任务上下文、模型缓存与按路由限流测试。"""

import asyncio
from threading import Barrier, Event, Lock, Thread

import pytest

from teacheragent.capabilities.llm.contracts import LlmMessages
from teacheragent.config.llm import LlmSettings
from teacheragent.infrastructure.llm.runtime import LlmRuntime, TaskRuntimeContext


SETTINGS: LlmSettings = {
    "role": "tutor",
    "provider": "openai",
    "model": "deepseek-chat",
    "temperature": 0.7,
}


def _llm_messages() -> LlmMessages:
    return LlmMessages(
        sources=[],
        template_text="",
        messages=[{"role": "user", "content": "hello"}],
    )


def test_task_context_allocates_sequence_then_attempts():
    task_context = TaskRuntimeContext(role="tutor")
    runtime = LlmRuntime()

    first = runtime.new_request(task_context, _llm_messages())
    second = runtime.new_request(task_context, _llm_messages())

    assert first.task_id == second.task_id == task_context.task_id
    assert first.query_id == second.query_id == task_context.query_id
    assert (first.sequence, second.sequence) == (1, 2)

    first_attempt = first.next_attempt()
    second_attempt = first.next_attempt()

    assert (first_attempt.attempt, second_attempt.attempt) == (1, 2)
    assert first_attempt.sequence == second_attempt.sequence == first.sequence
    assert first_attempt.run_id != second_attempt.run_id


def test_route_limiter_caps_concurrent_requests():
    runtime = LlmRuntime(default_limit=1)
    limiter = runtime.limiter_for(SETTINGS)
    barrier = Barrier(2)
    entered = Event()
    release = Event()
    state_lock = Lock()
    active = 0
    peak = 0

    def worker() -> None:
        nonlocal active, peak
        barrier.wait()
        with limiter.acquire():
            with state_lock:
                active += 1
                peak = max(peak, active)
                entered.set()
            release.wait(timeout=2)
            with state_lock:
                active -= 1

    first = Thread(target=worker)
    second = Thread(target=worker)
    first.start()
    second.start()
    assert entered.wait(timeout=2)
    release.set()
    first.join(timeout=2)
    second.join(timeout=2)

    assert not first.is_alive()
    assert not second.is_alive()
    assert peak == 1


def test_limiter_stats_report_in_flight_and_waiting():
    runtime = LlmRuntime(default_limit=1)
    limiter = runtime.limiter_for(SETTINGS)

    with limiter.acquire():
        (busy,) = runtime.limiter_stats()
        assert (busy.provider, busy.model) == ("openai", "deepseek-chat")
        assert busy.in_flight == 1
        assert busy.waiting == 0

    (idle,) = runtime.limiter_stats()
    assert idle.in_flight == 0
    assert idle.limit == 1


@pytest.mark.anyio
async def test_async_acquire_waits_without_blocking_the_event_loop():
    runtime = LlmRuntime(default_limit=1)
    limiter = runtime.limiter_for(SETTINGS)
    order: list[str] = []

    async def ticker() -> None:
        for _ in range(5):
            await asyncio.sleep(0)
        order.append("ticker")

    async def holder(name: str) -> None:
        async with limiter.aacquire():
            await asyncio.sleep(0.05)
        order.append(name)

    await asyncio.gather(holder("first"), holder("second"), ticker())

    assert order[0] == "ticker"
    assert limiter.in_flight == 0


def test_runtime_reuses_model_until_configuration_changes():
    runtime = LlmRuntime()
    created: list[tuple[str, object]] = []

    def factory(settings: LlmSettings) -> object:
        model = object()
        created.append((settings["model"], model))
        return model

    first = runtime.get_model(SETTINGS, factory)
    second = runtime.get_model(SETTINGS, factory)
    changed: LlmSettings = {
        "role": SETTINGS["role"],
        "provider": SETTINGS["provider"],
        "model": SETTINGS["model"],
        "temperature": 0.1,
    }
    third = runtime.get_model(changed, factory)

    assert first is second
    assert third is not first
    assert [model for _, model in created] == [first, third]


def test_runtime_replaces_route_limiter_without_affecting_existing_request():
    runtime = LlmRuntime(default_limit=1)
    entered = Event()
    release = Event()

    def holder() -> None:
        with runtime.limiter_for(SETTINGS).acquire():
            entered.set()
            release.wait(timeout=2)

    thread = Thread(target=holder)
    thread.start()
    assert entered.wait(timeout=2)

    runtime.update_route_limit(("openai", "deepseek-chat"), 2)
    with runtime.limiter_for(SETTINGS).acquire():
        pass

    release.set()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_closed_runtime_rejects_new_requests():
    runtime = LlmRuntime()
    runtime.close()

    with pytest.raises(RuntimeError, match="runtime is closed"):
        runtime.limiter_for(SETTINGS)