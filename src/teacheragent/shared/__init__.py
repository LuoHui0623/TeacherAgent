"""跨层共享：LLM 调用日志拦截器。"""

from .llm_interceptor import CallRecord, intercept

__all__ = ["CallRecord", "intercept"]
