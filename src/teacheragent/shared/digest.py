"""内容身份：稳定哈希。

资产与产物都用它当内容身份：同一份内容不论键序、空白如何变化，哈希一致，
因此 `content_hash` 可以直接用来判断「是不是同一版」。
"""

import hashlib
import json
from typing import Any


def content_hash(payload: Any) -> str:
    """内容的稳定哈希（`sha256:` 前缀 + 十六进制）；键序与空白不影响结果。"""
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()
