"""llm_settings 仓储：每角色有效配置的持久化。"""

from teacheragent.config import llm
from teacheragent.config.llm import LlmSettings
from teacheragent.constants import AgentRole
from teacheragent.store.sqlite import database
from teacheragent.store.sqlite.tables import llm_settings as table


def get_settings(role: AgentRole | str) -> LlmSettings:
    """读某角色的**有效配置**。

    - 表中无记录时取代码默认值，读取路径无副作用（不写库）。
    - 两个分支返回**同一形状**：只含 `role`/`provider`/`model`/`temperature`,
      不泄漏存储细节（`id`/`updated_at`）。
    """
    key = str(role)
    rows = database.query(
        f"SELECT role, provider, model, temperature FROM {table.TABLE} WHERE role = ?",
        (key,),
    )
    if rows:
        return rows[0]
    option = llm.default_option()
    return {
        "role": key,
        "provider": option.provider,
        "model": option.model,
        "temperature": llm.DEFAULT_TEMPERATURE,
    }


def save_settings(
    role: AgentRole | str,
    *,
    model: str | None = None,
    temperature: float | None = None,
) -> LlmSettings:
    """写入角色配置（用户喜好），未传字段保持原值，返回更新后的有效配置。

    每次 `invoke_llm` 现读配置，因此保存后即刻生效，无需重启。
    """
    key = str(role)
    current = get_settings(role)
    new_model = model or current["model"]
    option = llm.find_option(new_model)
    new_temperature = temperature if temperature is not None else current["temperature"]
    database.execute(
        f"INSERT INTO {table.TABLE} (role, provider, model, temperature) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(role) DO UPDATE SET provider = excluded.provider, model = excluded.model, "
        "temperature = excluded.temperature, updated_at = datetime('now')",
        (key, option.provider if option else current["provider"], new_model, new_temperature),
    )
    return get_settings(role)
