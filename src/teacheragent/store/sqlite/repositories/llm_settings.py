"""llm_settings 仓储：每角色模型配置的持久化。"""

from teacheragent.config import llm_catalog
from teacheragent.constants import AgentRole
from teacheragent.store.sqlite import database
from teacheragent.store.sqlite.schemas import llm_settings as schema


def get_settings(role: AgentRole | str) -> dict:
    """读某角色的模型配置。

    表中无记录时返回**代码默认值**，不写库（读取路径无副作用）。
    """
    key = str(role)
    rows = database.query(f"SELECT * FROM {schema.TABLE} WHERE role = ?", (key,))
    if rows:
        return rows[0]
    option = llm_catalog.default_option()
    return {
        "role": key,
        "provider": option.provider,
        "model": option.model,
        "temperature": llm_catalog.DEFAULT_TEMPERATURE,
    }


def save_settings(
    role: AgentRole | str,
    *,
    model: str | None = None,
    temperature: float | None = None,
) -> dict:
    """写入角色配置（用户喜好），未传字段保持原值，返回更新后的配置。

    每次 `invoke_llm` 现读配置，因此保存后即刻生效，无需重启。
    """
    key = str(role)
    current = get_settings(role)
    new_model = model or current["model"]
    option = llm_catalog.find_option(new_model)
    new_temperature = temperature if temperature is not None else current["temperature"]
    database.execute(
        f"INSERT INTO {schema.TABLE} (role, provider, model, temperature) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(role) DO UPDATE SET provider = excluded.provider, model = excluded.model, "
        "temperature = excluded.temperature, updated_at = datetime('now')",
        (key, option.provider if option else current["provider"], new_model, new_temperature),
    )
    return get_settings(role)
