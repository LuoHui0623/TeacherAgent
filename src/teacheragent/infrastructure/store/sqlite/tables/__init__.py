"""表行契约：每张**有仓储消费方**的表一个模块，导出 `TABLE` 与 `ROW`。

`ROW` 为 `TypedDict`，列名与顺序必须与 `../scripts/*.sql` 的 DDL 一致，
由 `tests/test_table_contracts.py` 强制校验。

尚未建仓储的表（`textbooks` / `behavior_logs`）暂不建行契约 ——
结构以 DDL 为准，等出现真实消费方再补，避免死代码。
"""

from . import call_logs, llm_settings, user_profiles

__all__ = ["call_logs", "llm_settings", "user_profiles"]