"""导出前端测试用的图定义夹具。

前端不再持有图定义副本；这份夹具是 `GET /workflows/{id}` 的真实响应，由
`src/teacheragent/tests/test_workflow_api.py` 断言它与注册表一致，因此定义一改、
夹具没跟上的话后端测试就会失败。
"""

import json
from pathlib import Path

from teacheragent.workflows import (
    CONTENT_PIPELINE_WORKFLOW_ID,
    freeze_snapshot,
    get_definition,
)

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "frontend" / "tests" / "fixtures" / "workflows.json"


def main() -> None:
    """按当前注册表重写夹具文件。"""
    definition = get_definition(CONTENT_PIPELINE_WORKFLOW_ID)
    payload = {
        **definition.to_payload(),
        "version": definition.version,
        "contentHash": freeze_snapshot(CONTENT_PIPELINE_WORKFLOW_ID).content_hash,
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"已写入 {TARGET}")


if __name__ == "__main__":
    main()
