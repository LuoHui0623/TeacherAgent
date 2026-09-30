"""共享 LLM 运行时的任务上下文和并发控制测试。"""

from threading import Barrier, Event, Lock, Thread

import pytest

from teacheragent.capabilities.llm.contracts import PromptTrace
from teacheragent.config.llm import LlmSettings
from teacheragent.infrastructure.llm.runtime import LlmRuntime, TaskRuntimeContext


SETTINGS: LlmSettings = {
    "role": "tutor",
    "provider": "openai",
    "model": "deepseek-chat",
    "temperature": 0.7,
}


def _prompt_trace() -> PromptTrace:
    return PromptTrace(
        sources=[],
        template_text="",
        messages=[{"role": "user", "content": "hello"}],
    )


def test_task_context_creates_distinct_request_ids_without_mutating_task_context():
    task_context = TaskRuntimeContext(role="tutor")
    runtime = LlmRuntime()

    first = runtime.new_request(task_context, _prompt_trace(), sequence=1)
    second = runtime.new_request(task_context, _prompt_trace(), sequence=1, attempt=2)

    assert first.task_id == second.task_id == task_context.task_id
    assert first.query_id == second.query_id == task_context.query_id
    assert first.run_id != second.run_id
    assert first.attempt == 1
    assert second.attempt == 2


def test_runtime_limits_concurrent_requests_per_route():
    runtime = LlmRuntime(default_limit=1)
    barrier = Barrier(2)
    entered = Event()
    release = Event()
    state_lock = Lock()
    active = 0
    peak = 0

    def worker() -> None:
        nonlocal active, peak
        barrier.wait()
        with runtime.acquire(SETTINGS):
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
        with runtime.acquire(SETTINGS):
            entered.set()
            release.wait(timeout=2)

    thread = Thread(target=holder)
    thread.start()
    assert entered.wait(timeout=2)

    runtime.update_route_limit(("openai", "deepseek-chat"), 2)
    with runtime.acquire(SETTINGS):
        pass

    release.set()
    thread.join(timeout=2)
    assert not thread.is_alive()


def test_closed_runtime_rejects_new_requests():
    runtime = LlmRuntime()
    runtime.close()

    with pytest.raises(RuntimeError, match="runtime is closed"):
        with runtime.acquire(SETTINGS):
            pass