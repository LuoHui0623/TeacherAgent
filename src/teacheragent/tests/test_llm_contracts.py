"""LLM 运行契约测试。"""

import pytest
from pydantic import ValidationError

from teacheragent.capabilities.llm.contracts import (
    LlmConfig,
    LlmRun,
    PromptSource,
    PromptTrace,
    RunContext,
)


def _prompt_trace() -> PromptTrace:
    return PromptTrace(
        sources=[PromptSource(ref="agent/prompts/tutor.md", content_hash="sha256:test")],
        template_text="You are a tutor.",
        messages=[{"role": "system", "content": "You are a tutor."}],
    )


def test_prompt_trace_carries_source_and_input_messages():
    trace = _prompt_trace()

    assert trace.sources[0].ref == "agent/prompts/tutor.md"
    assert trace.template_text == trace.messages[0]["content"]


def test_prompt_trace_exposes_role_views_without_losing_order():
    trace = PromptTrace(
        sources=[PromptSource(ref="agent/prompts/tutor.md", content_hash="sha256:test")],
        template_text="You are a tutor.",
        messages=[
            {"role": "system", "content": "You are a tutor."},
            {"role": "user", "content": "第一问"},
            {"role": "assistant", "content": "第一答"},
            {"role": "tool", "content": "工具结果", "tool_call_id": "call_1"},
            {"role": "user", "content": "第二问"},
        ],
    )

    assert trace.system_prompt == "You are a tutor."
    assert trace.user_prompt == "第二问"
    assert trace.messages[3]["tool_call_id"] == "call_1"


def test_prompt_trace_role_views_are_not_stored_fields():
    trace = _prompt_trace()

    assert "system_prompt" not in trace.model_dump()
    assert "user_prompt" not in trace.model_dump()


def test_prompt_trace_role_views_are_none_without_matching_message():
    trace = PromptTrace(
        sources=[PromptSource(ref="agent/prompts/tutor.md", content_hash="sha256:test")],
        template_text="You are a tutor.",
        messages=[{"role": "assistant", "content": "只有回答"}],
    )

    assert trace.system_prompt is None
    assert trace.user_prompt is None


def test_run_context_carries_invocation_order():
    context = RunContext(
        prompt_trace=_prompt_trace(),
        invocation_id="invocation-1",
        sequence=2,
    )

    assert context.invocation_id == "invocation-1"
    assert context.sequence == 2


def test_llm_run_carries_identity_prompt_and_status():
    run = LlmRun(
        client_id="client-1",
        llm_config=LlmConfig(model="deepseek-chat", temperature=0.7),
        invocation_id="invocation-1",
        sequence=1,
        role="tutor",
        prompt_trace=_prompt_trace(),
        status="running",
        started_at="2026-09-30T10:00:00Z",
    )

    assert run.llm_config.model == "deepseek-chat"
    assert run.token_usage == {}
    assert run.completed_at is None


def test_llm_config_rejects_unknown_config_keys():
    with pytest.raises(ValidationError):
        LlmConfig.model_validate(
            {"model": "deepseek-chat", "temperature": 0.7, "provider": "openai"}
        )


def test_contracts_reject_extra_fields_and_coerce_nothing():
    with pytest.raises(ValidationError):
        PromptSource.model_validate(
            {
                "ref": "agent/prompts/tutor.md",
                "content_hash": "sha256:test",
                "unexpected": "value",
            }
        )

    with pytest.raises(ValidationError):
        RunContext.model_validate(
            {
                "prompt_trace": _prompt_trace().model_dump(),
                "invocation_id": "invocation-1",
                "sequence": "2",
            }
        )