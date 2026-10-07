"""JSON 文本解析：从可能带代码块围栏的回复里取出对象。

模型回复常常把 JSON 包在 ``` 围栏里，或在前后留空行；这里按宽松策略取出对象，
解析失败一律抛 `ValueError`，由调用方决定它算哪种错误。
"""

import json
from typing import Any


def parse_json_object(content: str) -> dict[str, Any]:
    """解析 JSON 对象；容忍代码块围栏与前后空白，失败抛 `ValueError`。"""
    text = content.strip()
    if text.startswith("```"):
        text = _strip_fence(text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as error:
        raise ValueError(f"不是合法 JSON：{error}") from error
    if not isinstance(parsed, dict):
        raise ValueError("JSON 顶层必须是对象")
    return parsed


def _strip_fence(text: str) -> str:
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()
