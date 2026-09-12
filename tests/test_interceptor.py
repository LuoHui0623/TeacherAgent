"""拦截器契约：成功与异常路径均落库，异常照常上抛。"""

import pytest

from teacheragent.constants import AgentRole
from teacheragent.shared import intercept
from teacheragent.store import repositories
from teacheragent.store.sqlite.tables.call_logs import CallLogRow

SETTINGS = {
    "role": str(AgentRole.TEACHER),
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.7,
}


def _latest() -> CallLogRow:
    logs = repositories.call_logs.list_by_role(SETTINGS["role"])
    assert logs, "日志未落库"
    return logs[0]


def test_success_path_writes_ok_log():
    with intercept(SETTINGS, "in") as record:
        record.output_text = "out"
        record.usage = {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}

    log = _latest()
    assert log["status"] == "ok"
    assert log["output_text"] == "out"
    assert log["total_tokens"] == 5
    assert log["error"] == ""


def test_failure_path_writes_error_log_and_reraises():
    with pytest.raises(ValueError, match="boom"):
        with intercept(SETTINGS, "in"):
            raise ValueError("boom")

    log = _latest()
    assert log["status"] == "error"
    assert "boom" in log["error"]
    assert log["output_text"] == ""


def test_prompt_ref_is_recorded():
    with intercept(SETTINGS, "in", "prompts/teacher.md"):
        pass
    assert _latest()["prompt_ref"] == "prompts/teacher.md"


def test_prompt_ref_defaults_to_none():
    with intercept(SETTINGS, "in"):
        pass
    assert _latest()["prompt_ref"] is None


def test_duration_is_recorded():
    with intercept(SETTINGS, "in"):
        pass
    assert _latest()["duration_ms"] >= 0


def test_count_by_role():
    for _ in range(2):
        with intercept(SETTINGS, "in"):
            pass
    assert repositories.call_logs.count_by_role(SETTINGS["role"]) == 2
