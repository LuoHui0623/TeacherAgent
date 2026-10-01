"""LlmModel 的同步、streaming、异步、重试和记录生命周期。"""

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage

from teacheragent.agent.tutor import build_tutor_agent
from teacheragent.capabilities.llm.contracts import LlmMessages
from teacheragent.infrastructure.llm import model as llm_model
from teacheragent.infrastructure.llm.model import LlmModel
from teacheragent.infrastructure.llm.runtime import LlmRuntime, TaskRuntimeContext
from teacheragent.infrastructure.store import repositories


SETTINGS = {"role": "tutor", "provider": "openai", "model": "model-a", "temperature": 0.7}
MESSAGES = LlmMessages(sources=[], template_text="", messages=[{"role": "user", "content": "hi"}])


@pytest.fixture(autouse=True)
def _no_retry_wait(monkeypatch):
    """退避置 0，避免重试用例真的等待。"""
    monkeypatch.setattr(llm_model, "RETRY_WAIT_INITIAL", 0.0)
    monkeypatch.setattr(llm_model, "RETRY_WAIT_MAX", 0.0)
    monkeypatch.setattr(llm_model, "RETRY_WAIT_JITTER", 0.0)


class _Response:
    def __init__(self, content):
        self.content = content
        self.usage_metadata = {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}


class _Model:
    def invoke(self, messages):
        return _Response("answer")

    def stream(self, messages):
        yield _Response("one")
        yield _Response("two")

    async def ainvoke(self, messages):
        return _Response("async-answer")


def _llm_model() -> LlmModel:
    return LlmModel(
        wrapped=_Model(),
        settings=SETTINGS,
        llm_messages=MESSAGES,
        default_context=TaskRuntimeContext(role="tutor"),
        runtime=LlmRuntime(),
    )


def test_stream_keeps_record_until_iterator_finishes():
    chunks = list(_llm_model().stream(MESSAGES.messages))

    # LangChain 会在末尾追加一个空的内容块作为流结束标记。
    assert "".join(chunk.content for chunk in chunks) == "onetwo"
    rows = repositories.llm_runs.list_runs(role="tutor")
    assert rows[0]["status"] == "success"


@pytest.mark.anyio
async def test_ainvoke_records_success():
    response = await _llm_model().ainvoke(MESSAGES.messages)

    assert response.content == "async-answer"
    assert repositories.llm_runs.list_runs(role="tutor")[0]["status"] == "success"


@pytest.mark.anyio
async def test_astream_records_chunks_without_falling_back_to_sync_stream():
    class _AsyncStreaming:
        async def astream(self, messages):
            yield _Response("one")
            yield _Response("two")

    model = LlmModel(
        wrapped=_AsyncStreaming(),
        settings=SETTINGS,
        llm_messages=MESSAGES,
        default_context=TaskRuntimeContext(role="tutor"),
        runtime=LlmRuntime(),
    )

    chunks = [chunk async for chunk in model.astream(MESSAGES.messages)]

    assert "".join(chunk.content for chunk in chunks) == "onetwo"
    assert repositories.llm_runs.list_runs(role="tutor")[0]["status"] == "success"


def test_repeated_requests_in_one_task_get_increasing_sequence():
    """同一任务内多次模型调用必须各自落库，不能撞 query_id/sequence/attempt 唯一约束。"""
    model = _llm_model()

    model.invoke(MESSAGES.messages)
    model.invoke(MESSAGES.messages)

    rows = repositories.llm_runs.list_runs(role="tutor")
    assert sorted(row["sequence"] for row in rows) == [1, 2]


def test_tutor_graph_records_internal_model_request():
    graph = build_tutor_agent(
        FakeListChatModel(responses=["tutor-answer"]),
        tools=(),
        task_context=TaskRuntimeContext(role="tutor"),
    )
    result = graph.invoke({"messages": [{"role": "user", "content": "hi"}]})

    assert result["messages"][-1].content == "tutor-answer"
    assert repositories.llm_runs.list_runs(role="tutor")[0]["status"] == "success"


def test_retry_records_every_attempt_under_one_sequence():
    class _Flaky:
        def __init__(self) -> None:
            self.calls = 0

        def invoke(self, messages):
            self.calls += 1
            if self.calls < 3:
                raise RuntimeError("transient")
            return AIMessage(content="ok")

    model = LlmModel(
        wrapped=_Flaky(),
        settings=SETTINGS,
        llm_messages=MESSAGES,
        default_context=TaskRuntimeContext(role="tutor"),
        runtime=LlmRuntime(),
    )

    response = model.invoke(MESSAGES.messages)

    assert response.content == "ok"
    rows = repositories.llm_runs.list_runs(role="tutor")
    assert sorted(row["attempt"] for row in rows) == [1, 2, 3]
    assert len({row["sequence"] for row in rows}) == 1
    assert len({row["run_id"] for row in rows}) == 3


def test_retry_exhaustion_propagates_and_records_error_attempts():
    class _AlwaysFail:
        def invoke(self, messages):
            raise RuntimeError("boom")

    model = LlmModel(
        wrapped=_AlwaysFail(),
        settings=SETTINGS,
        llm_messages=MESSAGES,
        default_context=TaskRuntimeContext(role="tutor"),
        runtime=LlmRuntime(),
    )

    with pytest.raises(RuntimeError, match="boom"):
        model.invoke(MESSAGES.messages)

    rows = repositories.llm_runs.list_runs(role="tutor")
    assert sorted(row["attempt"] for row in rows) == [1, 2, 3]
    assert {row["status"] for row in rows} == {"error"}
