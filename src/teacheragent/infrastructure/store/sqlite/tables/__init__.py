"""表行契约：每张表一个模块，导出 `TABLE` 与 `ROW`。

`ROW` 为 `TypedDict`，列名与顺序必须与 `../scripts/*.sql` 的 DDL 一致，
由 `tests/test_table_contracts.py` 强制校验；校验集合取自本模块的 `__all__`，
因此新表必须在这里登记，否则契约不会被守护。

尚未有定义的残留表（`textbooks`）不建行契约，等它被删除或改成视图时一并处理。

字段较多的契约（八列以上）按语义分组，每组前面写一行 `# 分组名` 注释。分组只是给读者扫读用的，**不改变字段顺序** —— 顺序必须与 DDL 一致，由上面的契约测试强制。同一约定也适用于字段多的 dataclass（`Node`、`WorkflowCallOrigin` 等）。
"""

from . import (
    chat_messages,
    llm_profiles,
    llm_runs,
    llm_settings,
    node_artifacts,
    node_runs,
    prompt_snapshots,
    user_interaction,
    user_profiles,
    workflow_snapshots,
)

__all__ = [
    "chat_messages",
    "llm_profiles",
    "llm_runs",
    "llm_settings",
    "node_artifacts",
    "node_runs",
    "prompt_snapshots",
    "user_interaction",
    "user_profiles",
    "workflow_snapshots",
]