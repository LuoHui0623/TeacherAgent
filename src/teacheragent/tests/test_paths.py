"""路径契约：开发态定位到项目根，安装态回退系统标准目录，且都不抛异常。"""

import sys
from pathlib import Path

import pytest

from teacheragent.config import paths


def test_find_project_root_locates_repo():
    root = paths.find_project_root()
    assert root is not None
    assert (root / "pyproject.toml").is_file()


def test_dev_data_dir_is_inside_repo():
    """开发态（能找到 pyproject.toml）数据写在仓库内 data/。"""
    assert paths.DATA_DIR.name == "data"
    assert paths.DATA_DIR.parent == paths.find_project_root()


def test_dev_env_file_lives_at_project_root():
    assert paths.ENV_FILE.parent == paths.find_project_root()


def test_data_dir_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv(paths.DATA_DIR_ENV, str(tmp_path / "custom"))
    assert paths.resolve_data_dir() == tmp_path / "custom"


def test_env_file_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv(paths.ENV_FILE_ENV, str(tmp_path / ".env"))
    assert paths.resolve_env_file() == tmp_path / ".env"


def test_no_project_root_does_not_raise(monkeypatch, tmp_path):
    """打包后没有 pyproject.toml —— 旧实现会抛 RuntimeError，启动即失败。"""
    monkeypatch.delenv(paths.DATA_DIR_ENV, raising=False)
    monkeypatch.setattr(paths, "find_project_root", lambda: None)
    monkeypatch.setattr(paths, "system_data_dir", lambda: tmp_path / "app")
    assert paths.resolve_data_dir() == tmp_path / "app"


def test_env_file_falls_back_to_data_dir_without_project_root(monkeypatch, tmp_path):
    monkeypatch.delenv(paths.ENV_FILE_ENV, raising=False)
    monkeypatch.setattr(paths, "find_project_root", lambda: None)
    monkeypatch.setattr(paths, "resolve_data_dir", lambda: tmp_path / "app")
    assert paths.resolve_env_file() == tmp_path / "app" / ".env"


@pytest.mark.skipif(sys.platform != "win32", reason="仅在 Windows 上验证 LOCALAPPDATA")
def test_system_data_dir_uses_localappdata(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    assert paths.system_data_dir() == tmp_path / paths.APP_NAME


def test_system_data_dir_is_absolute():
    assert Path(paths.system_data_dir()).is_absolute()