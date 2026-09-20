"""配置项读取：`.env` 文件与系统环境变量。

API Key 采用**两级间接**：`.env` 只存「存密钥的环境变量名」（`API_KEY_NAME`），
密钥本体留在系统环境变量中，因此 `.env` 不含任何敏感值，可安全分享。

读取链::

    .env:  API_KEY_NAME=OPENCODE_API_KEY
    读取:  get_api_key_name() → "OPENCODE_API_KEY"
           get_api_key()      → os.environ["OPENCODE_API_KEY"] → 密钥值
"""

import os

from . import paths


def _parse_env_file() -> dict[str, str]:
    """解析 `.env`：跳过空行与 `#` 注释，`KEY=VALUE` 的值可含 `=`。"""
    env_file = paths.ENV_FILE
    if not env_file.is_file():
        return {}
    values: dict[str, str] = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def get_env(key: str, default: str = "") -> str:
    """读配置项：先 `.env`，后系统环境变量。"""
    return _parse_env_file().get(key) or os.environ.get(key, default)


def get_api_key_name() -> str:
    """读 `.env` 的 `API_KEY_NAME`，得到「存密钥的环境变量名」。

    任一级缺失时返回空串，不抛异常。
    """
    return get_env("API_KEY_NAME")


def get_api_key() -> str:
    """两级间接取密钥：`API_KEY_NAME` → 系统环境变量名 → 密钥值。

    任一级缺失时返回空串，不抛异常；由 provider 层在调用时报错。
    """
    name = get_api_key_name()
    return os.environ.get(name, "") if name else ""


def get_base_url() -> str:
    """读 `.env` 的 `OPENCODE_BASE_URL`（OpenAI 兼容网关地址）。"""
    return get_env("OPENCODE_BASE_URL")


def get_api_url() -> str:
    """读固定部署变量 `API_URL`，兼容旧部署变量 `OPENCODE_BASE_URL`。"""
    return get_env("API_URL") or get_env("OPENCODE_BASE_URL")
