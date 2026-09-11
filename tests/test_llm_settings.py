"""llm_settings 仓储契约：默认读取无副作用、保存即生效、upsert 唯一。"""

from teacheragent.config import llm_catalog
from teacheragent.constants import AgentRole
from teacheragent.store import repositories
from teacheragent.store.sqlite import database


def test_get_settings_returns_default_without_writing():
    settings = repositories.llm_settings.get_settings(AgentRole.TEACHER)
    assert settings["model"] == llm_catalog.default_option().model
    assert settings["temperature"] == llm_catalog.DEFAULT_TEMPERATURE
    assert database.query("SELECT * FROM llm_settings") == [], "读取路径不得写库"


def test_save_settings_persists_temperature():
    repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.2)
    assert repositories.llm_settings.get_settings(AgentRole.TEACHER)["temperature"] == 0.2


def test_save_settings_keeps_unspecified_fields():
    repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.2)
    updated = repositories.llm_settings.save_settings(AgentRole.TEACHER, model="gpt-4o")
    assert updated["model"] == "gpt-4o"
    assert updated["temperature"] == 0.2, "未传字段应保持原值"


def test_save_settings_is_upsert():
    for _ in range(3):
        repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.5)
    rows = database.query("SELECT * FROM llm_settings WHERE role = ?", ("teacher",))
    assert len(rows) == 1


def test_settings_are_isolated_per_role():
    repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.1)
    other = repositories.llm_settings.get_settings(AgentRole.CURRICULUM)
    assert other["temperature"] == llm_catalog.DEFAULT_TEMPERATURE


def test_unknown_model_falls_back_to_catalog():
    updated = repositories.llm_settings.save_settings(AgentRole.TEACHER, model="not-in-catalog")
    assert updated["model"] == "not-in-catalog", "用户可自定义模型名"
    assert updated["provider"] == "openai", "未收录模型沿用原 provider"
