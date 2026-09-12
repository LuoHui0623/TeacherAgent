"""llm_settings 仓储契约：默认读取无副作用、形状统一、保存即生效。"""

from teacheragent.config import llm
from teacheragent.config.llm import LlmSettings
from teacheragent.constants import AgentRole
from teacheragent.store import repositories
from teacheragent.store.sqlite import database


def test_get_settings_returns_default_without_writing():
    settings = repositories.llm_settings.get_settings(AgentRole.TEACHER)
    assert settings["model"] == llm.default_option().model
    assert settings["temperature"] == llm.DEFAULT_TEMPERATURE
    assert database.query("SELECT * FROM llm_settings") == [], "读取路径不得写库"


def test_settings_shape_is_identical_for_both_branches():
    """契约必须两分支同形：只含 LlmSettings 声明的 4 个键。"""
    expected = set(LlmSettings.__annotations__)

    fresh = repositories.llm_settings.get_settings(AgentRole.TEACHER)
    assert set(fresh) == expected, "默认分支不得多出或缺少键"

    repositories.llm_settings.save_settings(AgentRole.TEACHER, temperature=0.5)
    stored = repositories.llm_settings.get_settings(AgentRole.TEACHER)
    assert set(stored) == expected, "命中 DB 的分支不得泄漏 id/updated_at"


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
    assert other["temperature"] == llm.DEFAULT_TEMPERATURE


def test_unknown_model_falls_back_to_catalog():
    updated = repositories.llm_settings.save_settings(AgentRole.TEACHER, model="not-in-catalog")
    assert updated["model"] == "not-in-catalog", "用户可自定义模型名"
    assert updated["provider"] == "openai", "未收录模型沿用原 provider"
