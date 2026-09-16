"""LLM 调用日志器：一次调用的输入输出与元数据统一落库。"""

import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from teacheragent.infrastructure.store import repositories


@dataclass
class CallRecord:
    """一次调用的可写记录。"""

    role: str
    provider: str
    model: str
    input_text: str
    prompt_ref: str | None = None
    output_text: str = ""
    usage: dict = field(default_factory=dict)


@contextmanager
def log_llm_call(
    settings: dict,
    input_text: str,
    prompt_ref: str | None = None,
) -> Iterator[CallRecord]:
    """包裹一次 LLM 调用；成功与异常路径均落库，异常照常上抛。"""
    record = CallRecord(
        role=settings["role"],
        provider=settings["provider"],
        model=settings["model"],
        input_text=input_text,
        prompt_ref=prompt_ref,
    )
    start = time.perf_counter()
    try:
        yield record
    except Exception as exc:
        _write(record, start, status="error", error=str(exc))
        raise
    else:
        _write(record, start, status="ok")


def _write(record: CallRecord, start: float, *, status: str, error: str = "") -> int:
    """落库单条调用日志。"""
    return repositories.call_logs.insert_log(
        role=record.role,
        provider=record.provider,
        model=record.model,
        input_text=record.input_text,
        output_text=record.output_text,
        usage=record.usage,
        duration_ms=int((time.perf_counter() - start) * 1000),
        status=status,
        error=error,
        prompt_ref=record.prompt_ref,
    )
