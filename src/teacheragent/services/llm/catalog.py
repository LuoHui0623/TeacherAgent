"""模型目录服务编排：供 API 层调用运行时刷新与查询。"""

from teacheragent.infrastructure.llm import catalog


def list_models() -> tuple[str, ...]:
    return catalog.list_models()


def refresh_models() -> dict:
    return catalog.refresh_models()
