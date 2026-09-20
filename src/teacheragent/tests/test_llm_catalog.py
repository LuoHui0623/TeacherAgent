"""模型目录契约：只保存 id、失败保留旧目录、增删可感知。"""

import pytest

from teacheragent.infrastructure.llm import catalog
from teacheragent.infrastructure.store import repositories


@pytest.fixture(autouse=True)
def _fresh_catalog():
    catalog.reset_catalog()
    yield
    catalog.reset_catalog()


def test_model_provider_is_extracted_from_id():
    assert catalog.model_provider("minimax-m3") == "minimax"
    assert catalog.model_provider("kimi-k2.7-code") == "kimi"
    assert catalog.model_provider("glm-5.3-flash") == "glm"
    assert catalog.model_provider("deepseek-v4-pro") == "deepseek"
    assert catalog.model_provider("gpt-5.6-luna") == "gpt"


def test_refresh_models_only_keeps_ids():
    result = catalog.refresh_models(
        lambda: {
            "object": "list",
            "data": [
                {"id": "minimax-m3", "created": 1, "owned_by": "opencode"},
                {"id": "kimi-k2.6", "created": 1, "owned_by": "opencode"},
            ],
        }
    )

    assert result["ok"] is True
    assert catalog.list_models() == ("minimax-m3", "kimi-k2.6")
    assert catalog.model_exists("minimax-m3")


def test_refresh_failure_keeps_previous_catalog():
    catalog.refresh_models(
        lambda: {"object": "list", "data": [{"id": "kimi-k2.6"}]}
    )

    result = catalog.refresh_models(
        lambda: (_ for _ in ()).throw(ValueError("模型列表为空"))
    )

    assert result["ok"] is False
    assert result["error_type"] == "invalid_response"
    assert catalog.list_models() == ("kimi-k2.6",)


def test_refresh_reports_added_and_removed_models():
    catalog.refresh_models(
        lambda: {"object": "list", "data": [{"id": "a"}, {"id": "b"}]}
    )

    result = catalog.refresh_models(
        lambda: {"object": "list", "data": [{"id": "b"}, {"id": "c"}]}
    )

    assert result["ok"] is True
    assert result["added"] == ["c"]
    assert result["removed"] == ["a"]
    assert result["models"] == ("b", "c")


def test_refresh_syncs_profile_validity():
    repositories.llm_profiles.upsert_profile(
        "tutor",
        "old",
        model="removed-model",
        temperature=0.2,
    )
    repositories.llm_profiles.upsert_profile(
        "tutor",
        "current",
        model="kept-model",
        temperature=0.3,
    )

    result = catalog.refresh_models(
        lambda: {"object": "list", "data": [{"id": "kept-model"}]}
    )

    assert result["ok"] is True
    assert repositories.llm_profiles.get_profile("tutor", "old")["valid"] == 0
    assert repositories.llm_profiles.get_profile("tutor", "current")["valid"] == 1

