"""配置读取契约：API Key 两级间接、边界缺失一律空串不抛异常。"""

import pytest

from teacheragent.config import env, paths


@pytest.fixture
def dotenv(tmp_path, monkeypatch):
    """把 `.env` 指向临时文件（内容由用例按需写入）。"""
    path = tmp_path / ".env"
    # 挂载 paths.ENV_FILE：配置位置以 paths 为唯一来源，env 按需读取，
    # 这样 TEACHERAGENT_ENV_FILE 的运行时覆盖才生效。
    monkeypatch.setattr(paths, "ENV_FILE", path)
    return path


def test_api_key_resolved_through_two_hops(dotenv, monkeypatch):
    dotenv.write_text("API_KEY_NAME=MY_TEST_KEY\n", encoding="utf-8")
    monkeypatch.setenv("MY_TEST_KEY", "sk-secret")
    assert env.get_api_key_name() == "MY_TEST_KEY"
    assert env.get_api_key() == "sk-secret"


def test_api_key_name_absent_returns_empty(dotenv, monkeypatch):
    dotenv.write_text("OPENCODE_BASE_URL=https://example.test/v1\n", encoding="utf-8")
    monkeypatch.delenv("API_KEY_NAME", raising=False)
    assert env.get_api_key_name() == ""
    assert env.get_api_key() == ""


def test_api_key_absent_from_system_env_returns_empty(dotenv, monkeypatch):
    dotenv.write_text("API_KEY_NAME=NOT_SET_KEY\n", encoding="utf-8")
    monkeypatch.delenv("NOT_SET_KEY", raising=False)
    assert env.get_api_key_name() == "NOT_SET_KEY"
    assert env.get_api_key() == ""


def test_env_file_ignores_comments_and_blank_lines(dotenv):
    dotenv.write_text(
        "# 注释行\n\nOPENCODE_BASE_URL=https://example.test/v1\n",
        encoding="utf-8",
    )
    assert env.get_base_url() == "https://example.test/v1"


def test_env_file_value_may_contain_equals(dotenv):
    dotenv.write_text("OPENCODE_BASE_URL=https://example.test/v1?a=b\n", encoding="utf-8")
    assert env.get_base_url() == "https://example.test/v1?a=b"


def test_missing_env_file_is_safe(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "ENV_FILE", tmp_path / "absent.env")
    monkeypatch.delenv("DEFINITELY_NOT_SET", raising=False)
    assert env.get_env("DEFINITELY_NOT_SET") == ""
    assert env.get_base_url() == ""


def test_env_file_takes_precedence_over_system_env(dotenv, monkeypatch):
    dotenv.write_text("OPENCODE_BASE_URL=https://from-file.test/v1\n", encoding="utf-8")
    monkeypatch.setenv("OPENCODE_BASE_URL", "https://from-system.test/v1")
    assert env.get_base_url() == "https://from-file.test/v1"
