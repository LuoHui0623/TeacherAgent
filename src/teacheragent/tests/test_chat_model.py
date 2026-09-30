"""ChatModel 的同步、streaming 和异步记录生命周期。"""

import pytest
from langchain_core.language_models.fake_chat_models import FakeListChatModel

from teacheragent.capabilities.llm.contracts import PromptTrace
from teacheragent.infrastructure.llm.model import ChatModel
from teacheragent.agent.tutor import build_tutor_agent
from teacheragent.infrastructure.llm.runtime import LlmRuntime, TaskRuntimeContext
from teacheragent.infrastructure.store import repositories


SETTINGS = {"role": "tutor", "provider": "openai", "model": "model-a", "temperature": 0.7}
TRACE = PromptTrace(sources=[], template_text="", messages=[{"role": "user", "content": "hi"}])


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


def test_stream_keeps_record_until_iterator_finishes():
    model = ChatModel(_Model(), runtime=LlmRuntime(), settings=SETTINGS)
    chunks = list(model.stream(TRACE.messages, task_context=TaskRuntimeContext(role="tutor"), prompt_trace=TRACE))

    assert [chunk.content for chunk in chunks] == ["one", "two"]
    rows = repositories.llm_runs.list_runs(role="tutor")
    assert rows[0]["status"] == "success"


@pytest.mark.anyio
async def test_ainvoke_records_success():
    model = ChatModel(_Model(), runtime=LlmRuntime(), settings=SETTINGS)
    response = await model.ainvoke(TRACE.messages, task_context=TaskRuntimeContext(role="tutor"), prompt_trace=TRACE)

    assert response.content == "async-answer"
    assert repositories.llm_runs.list_runs(role="tutor")[0]["status"] == "success"


def test_tutor_graph_records_internal_model_request():
    graph = build_tutor_agent(
        FakeListChatModel(responses=["tutor-answer"]),
        tools=(),
        task_context=TaskRuntimeContext(role="tutor"),
    )
    result = graph.invoke({"messages": [{"role": "user", "content": "hi"}]})

    assert result["messages"][-1].content == "tutor-answer"
    assert repositories.llm_runs.list_runs(role="tutor")[0]["status"] == "success"
