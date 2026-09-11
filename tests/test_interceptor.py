"""拦截器契约：成功与异常路径均落库，异常照常上抛。"""

import pytest

from teacheragent.shared import intercept
from teacheragent.store import repositories
from teacheragent.store.sqlite import database

SETTINGS = {
    "role": "teacher",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.7,
}


def _logs() -> list[dict]:
    return database.query("SELECT * FROM call_logs ORDER BY id")


def test_success_path_writes_ok_log():
    with intercept(SETTINGS, "in") as record:
        record.output_text = "out"
        record.usage = {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}

    log = _logs()[0]
    assert log["status"] == "ok"
    assert log["output_text"] == "out"
    assert log["total_tokens"] == 5
    assert log["error"] == ""


def test_failure_path_writes_error_log_and_reraises():
    with pytest.raises(ValueError, match="boom"):
        with intercept(SETTINGS, "in"):
            raise ValueError("boom")

    log = _logs()[0]
    assert log["status"] == "error"
    assert "boom" in log["error"]
    assert log["output_text"] == ""


def test_prompt_version_id_is_recorded():
    with intercept(SETTINGS, "in", 42):
        pass
    assert _logs()[0]["prompt_version_id"] == 42


def test_duration_is_recorded():
    with intercept(SETTINGS, "in"):
        pass
    assert _logs()[0]["duration_ms"] >= 0


def test_count_by_role():
    for _ in range(2):
        with intercept(SETTINGS, "in"):
            pass
    assert repositories.call_logs.count_by_role("teacher") == 2
