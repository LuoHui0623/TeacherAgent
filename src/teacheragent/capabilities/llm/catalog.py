"""运行时模型目录：启动加载、前端刷新、增删感知与 Profile 同步。"""

import json
import re
import threading
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from teacheragent.config import env
from teacheragent.store import repositories


MODEL_ENDPOINT = "https://opencode.ai/zen/go/v1/models"
"""固定部署环境使用的模型列表地址。"""

REQUEST_TIMEOUT_SECONDS = 20

_PROVIDER_PATTERN = re.compile(r"^([A-Za-z][A-Za-z0-9_]*?)(?=[-_.]|\d|$)")
_SCOPED_PROVIDER_PATTERN = re.compile(r"^([A-Za-z][A-Za-z0-9_.-]*)/(.+)$")

_MODELS: tuple[str, ...] = ()
_LOADED = False
_LAST_ERROR: str | None = None
_LOCK = threading.RLock()

Fetcher = Callable[[], list[dict[str, Any]]]


def list_models() -> tuple[str, ...]:
    """返回当前内存目录中的模型 id，保持远端原始顺序。"""
    with _LOCK:
        return _MODELS


def model_provider(model_id: str) -> str:
    """从 model id 内部推导 provider，不作为用户输入。"""
    scoped = _SCOPED_PROVIDER_PATTERN.fullmatch(model_id)
    if scoped:
        return scoped.group(1).lower()
    match = _PROVIDER_PATTERN.match(model_id)
    return match.group(1).lower() if match else ""


def refresh_models(fetcher: Fetcher | None = None) -> dict:
    """刷新内存目录；失败时保留旧目录，并同步 Profile 有效态。

    `fetcher` 仅测试注入使用；默认请求固定 OpenCode 接口。
    """
    global _MODELS, _LOADED, _LAST_ERROR
    try:
        response = (fetcher or _fetch_models)()
        models = _parse_model_ids(response)
    except Exception as exc:
        error = _classify_fetch_error(exc)
        with _LOCK:
            _LAST_ERROR = error["message"]
        return {
            "ok": False,
            "added": [],
            "removed": [],
            "models": list_models(),
            "profile_changes": {"invalid_profiles": [], "recovered_profiles": []},
            **error,
        }

    with _LOCK:
        previous = _MODELS
        _MODELS = models
        _LOADED = True
        _LAST_ERROR = None
        added = [model for model in models if model not in previous]
        removed = [model for model in previous if model not in models]
    profile_changes = repositories.llm_profiles.sync_model_catalog(models)
    return {
        "ok": True,
        "added": added,
        "removed": removed,
        "models": models,
        "profile_changes": profile_changes,
    }


def last_refresh_error() -> str | None:
    """读取最近一次刷新失败的稳定原因。"""
    with _LOCK:
        return _LAST_ERROR


def is_loaded() -> bool:
    """目录是否已成功加载过。"""
    with _LOCK:
        return _LOADED


def model_exists(model_id: str) -> bool:
    """校验 model id 是否在当前内存目录中。"""
    return model_id in list_models()


def reset_catalog() -> None:
    """测试夹具使用：清空内存目录状态。"""
    global _MODELS, _LOADED, _LAST_ERROR
    with _LOCK:
        _MODELS = ()
        _LOADED = False
        _LAST_ERROR = None


def _parse_model_ids(response: Any) -> tuple[str, ...]:
    """只提取受支持模型 id；空列表与格式错误视为刷新失败。"""
    if not isinstance(response, dict) or response.get("object") != "list":
        raise ValueError("模型列表响应格式错误")
    raw_items = response.get("data")
    if not isinstance(raw_items, list):
        raise ValueError("模型列表响应缺少 data")

    models: list[str] = []
    for item in raw_items:
        if not isinstance(item, dict):
            raise ValueError("模型列表项格式错误")
        model_id = item.get("id")
        if not isinstance(model_id, str) or not model_id.strip():
            raise ValueError("模型列表项缺少有效 id")
        model_id = model_id.strip()
        if model_id not in models:
            models.append(model_id)
    if not models:
        raise ValueError("模型列表为空")
    return tuple(models)


def _fetch_models() -> list[dict[str, Any]]:
    """请求固定 OpenCode 接口并返回 JSON data 列表。"""
    headers = {"User-Agent": "TeacherAgent/0.1"}
    api_key = env.get_api_key()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        MODEL_ENDPOINT,
        headers=headers,
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = response.read()
    payload = json.loads(body)
    return payload


def _classify_fetch_error(exc: Exception) -> dict:
    """把网络、鉴权和响应错误归为可读类型，不暴露密钥。"""
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code in {401, 403}:
            return {
                "error_type": "auth_failure",
                "message": f"模型列表鉴权失败（HTTP {exc.code}）",
            }
        return {
            "error_type": "endpoint_failure",
            "message": f"模型列表接口返回 HTTP {exc.code}",
        }
    if isinstance(exc, urllib.error.URLError):
        return {
            "error_type": "network_failure",
            "message": "无法访问模型列表接口",
        }
    if isinstance(exc, json.JSONDecodeError):
        return {
            "error_type": "invalid_response",
            "message": "模型列表响应不是合法 JSON",
        }
    return {
        "error_type": "invalid_response",
        "message": str(exc),
    }
