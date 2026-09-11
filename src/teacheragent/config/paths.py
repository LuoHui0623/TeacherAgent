"""项目路径集中定义。

项目根以 `pyproject.toml` 为标记向上查找，避免硬编码目录层级。
"""

from pathlib import Path


def _find_project_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "pyproject.toml").is_file():
            return parent
    raise RuntimeError("未找到项目根：向上查找不到 pyproject.toml")


PROJECT_ROOT = _find_project_root()
"""项目根目录。"""

DATA_DIR = PROJECT_ROOT / "data"
"""运行期数据目录（SQLite 等）。"""

DB_PATH = DATA_DIR / "teacheragent.db"
"""SQLite 数据库文件。"""

ENV_FILE = PROJECT_ROOT / ".env"
"""本地配置文件（已 gitignore，不含敏感值）。"""
