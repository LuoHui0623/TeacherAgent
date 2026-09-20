"""按角色 Profile 契约：校验、隔离、激活与下一次调用生效。"""

import pytest

from teacheragent.infrastructure.llm import catalog
from teacheragent.infrastructure.llm import profiles as profile_capability
from teacheragent.infrastructure.llm.settings import get_settings
from teacheragent.constants import AgentRole
from teacheragent.infrastructure.store import repositories


@pytest.fixture(autouse=True)
def _fresh_catalog():
    catalog.reset_catalog()
    yield
    catalog.reset_catalog()


def _load_models(*models: str) -> None:
    catalog.refresh_models(
        lambda: {"object": "list", "data": [{"id": model} for model in models]}
    )


def test_profile_fields_are_role_scoped():
    _load_models("kimi-k2.6", "minimax-m3")

    tutor = profile_capability.save_profile(
        AgentRole.TUTOR,
        "fast",
        model="kimi-k2.6",
        temperature=0.2,
        create=True,
    )
    curriculum = profile_capability.save_profile(
        AgentRole.CURRICULUM,
        "fast",
        model="minimax-m3",
        temperature=0.5,
        create=True,
    )

    assert tutor["role"] == "tutor"
    assert curriculum["role"] == "curriculum"
    assert profile_capability.list_profiles(AgentRole.TUTOR) != profile_capability.list_profiles(AgentRole.CURRICULUM)


def test_profile_name_is_unique_within_role():
    _load_models("kimi-k2.6")
    profile_capability.save_profile(
        AgentRole.TUTOR,
        "fast",
        model="kimi-k2.6",
        temperature=0.2,
        create=True,
    )

    with pytest.raises(ValueError, match="Profile 已存在"):
        profile_capability.save_profile(
            AgentRole.TUTOR,
            "fast",
            model="kimi-k2.6",
            temperature=0.3,
            create=True,
        )


def test_profile_model_must_be_in_catalog():
    _load_models("kimi-k2.6")

    with pytest.raises(ValueError, match="模型不在当前目录中"):
        profile_capability.save_profile(
            AgentRole.TUTOR,
            "fast",
            model="missing-model",
            temperature=0.2,
        )


def test_active_profile_is_isolated_and_used_on_next_read():
    _load_models("kimi-k2.6", "minimax-m3")
    profile_capability.save_profile(
        AgentRole.TUTOR,
        "calm",
        model="kimi-k2.6",
        temperature=0.1,
        create=True,
    )
    profile_capability.save_profile(
        AgentRole.CURRICULUM,
        "wild",
        model="minimax-m3",
        temperature=0.8,
        create=True,
    )

    profile_capability.activate_profile(AgentRole.TUTOR, "calm")
    profile_capability.activate_profile(AgentRole.CURRICULUM, "wild")

    assert get_settings(AgentRole.TUTOR)["temperature"] == 0.1
    assert get_settings(AgentRole.CURRICULUM)["temperature"] == 0.8


def test_ensure_default_profiles_uses_configured_model():
    _load_models("omen-alpha", "minimax-m3")

    profile_capability.ensure_default_profiles()

    for role in AgentRole:
        active = repositories.llm_profiles.get_active(str(role))
        assert active is not None
        assert active["profile_id"] == "default"
        assert active["model"] == "omen-alpha"


def test_ensure_default_profiles_upgrades_seeded_default_model():
    _load_models("legacy-model", "omen-alpha")
    repositories.llm_profiles.upsert_profile(
        str(AgentRole.TUTOR),
        "default",
        model="legacy-model",
        temperature=0.4,
    )
    repositories.llm_profiles.activate_profile(str(AgentRole.TUTOR), "default")

    profile_capability.ensure_default_profiles()

    active = repositories.llm_profiles.get_active(str(AgentRole.TUTOR))
    assert active is not None
    assert active["model"] == "omen-alpha"


