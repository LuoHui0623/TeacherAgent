"""调用日志拦截器：一次 LLM 调用的输入输出与元数据统一落库。

业务代码零侵入——以上下文管理器包裹调用，正常与异常路径都会写入 `call_logs`：

    with intercept(settings, input_text) as record:
        record.output_text = "..."
        record.usage = {"total_tokens": 42}
"""

import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from teacheragent.store import repositories


@dataclass
class CallRecord:
    """一次调用的可写记录，由调用方在 `with` 块内补全结果。"""

    role: str
    provider: str
    model: str
    input_text: str
    prompt_version_id: int | None = None
    output_text: str = ""
    usage: dict = field(default_factory=dict)


@contextmanager
def intercept(
    settings: dict,
    input_text: str,
    prompt_version_id: int | None = None,
) -> Iterator[CallRecord]:
    """包裹一次 LLM 调用；无论成功或异常均落库，异常照常向上抛出。"""
    record = CallRecord(
        role=settings["role"],
        provider=settings["provider"],
        model=settings["model"],
        input_text=input_text,
        prompt_version_id=prompt_version_id,
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
    """落库单条调用日志，返回自增 id。"""
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
        prompt_version_id=record.prompt_version_id,
    )
