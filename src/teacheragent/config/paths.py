"""项目与运行期路径集中定义。

定位策略（按优先级）：

1. **显式环境变量** —— `TEACHERAGENT_DATA_DIR` / `TEACHERAGENT_ENV_FILE`
2. **开发态** —— 向上查找 `pyproject.toml` 得到项目根，数据写在 `<项目根>/data`
3. **安装态** —— 找不到项目根，数据写系统标准目录

**安装态不假定仓库存在**：桌面打包后没有 `pyproject.toml`，旧实现在那种情况下
会直接抛 `RuntimeError`，启动即失败。所以这里不再抛异常，而是回退到系统标准目录。
"""

import os
import sys
from pathlib import Path

APP_NAME = "TeacherAgent"
"""应用名，用于系统标准目录与安装包。"""

DATA_DIR_ENV = "TEACHERAGENT_DATA_DIR"
"""显式指定数据目录的环境变量。"""

ENV_FILE_ENV = "TEACHERAGENT_ENV_FILE"
"""显式指定 `.env` 的环境变量。"""


def find_project_root() -> Path | None:
    """向上查找 `pyproject.toml` 得到项目根；找不到返回 None（安装态）。"""
    for parent in Path(__file__).resolve().parents:
        if (parent / "pyproject.toml").is_file():
            return parent
    return None


def system_data_dir() -> Path:
    """系统标准数据目录。

    - Windows：`%LOCALAPPDATA%\\TeacherAgent`（Local 而非 Roaming：SQLite 不该被同步）
    - macOS：`~/Library/Application Support/TeacherAgent`
    - Linux：`$XDG_DATA_HOME/TeacherAgent` 或 `~/.local/share/TeacherAgent`
    """
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA")
        root = Path(base) if base else Path.home() / "AppData" / "Local"
        return root / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    base = os.environ.get("XDG_DATA_HOME")
    root = Path(base) if base else Path.home() / ".local" / "share"
    return root / APP_NAME


def resolve_data_dir() -> Path:
    """解析数据目录：显式环境变量 > 开发态仓库内 `data/` > 系统标准目录。"""
    explicit = os.environ.get(DATA_DIR_ENV, "").strip()
    if explicit:
        return Path(explicit).expanduser()
    root = find_project_root()
    if root is not None:
        return root / "data"
    return system_data_dir()


def resolve_env_file() -> Path:
    """解析 `.env`：显式环境变量 > 项目根 > 数据目录。"""
    explicit = os.environ.get(ENV_FILE_ENV, "").strip()
    if explicit:
        return Path(explicit).expanduser()
    root = find_project_root()
    if root is not None:
        return root / ".env"
    return resolve_data_dir() / ".env"


PROJECT_ROOT = find_project_root()
"""开发态项目根；安装态为 None。"""

DATA_DIR = resolve_data_dir()
"""运行期数据目录（SQLite 等）。"""

DB_PATH = DATA_DIR / "teacheragent.db"
"""SQLite 数据库文件。"""

ENV_FILE = resolve_env_file()
"""本地配置文件（已 gitignore，不含敏感值）。"""