"""路径契约：项目根以 pyproject.toml 为标记定位，不硬编码层级。"""

from teacheragent.config import paths


def test_project_root_contains_pyproject():
    assert (paths.PROJECT_ROOT / "pyproject.toml").is_file()


def test_db_path_is_inside_data_dir():
    assert paths.DATA_DIR.name == "data"
    assert paths.DATA_DIR.parent == paths.PROJECT_ROOT


def test_env_file_lives_at_project_root():
    assert paths.ENV_FILE.parent == paths.PROJECT_ROOT
