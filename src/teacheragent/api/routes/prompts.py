"""提示词资产的读接口：正文与变量清单、历史版本、版本间 diff。

历史取自 `prompt_snapshots` —— 加载提示词时按 `(ref, content_hash)` 冻结的正文，
不读 git。这里的读不写快照：只有真正装载并发送给模型的那一次调用才追加版本。
"""

import difflib
from typing import Any, Final

from fastapi import APIRouter, HTTPException, Query

from teacheragent.infrastructure.llm.prompts import (
    Prompt,
    PromptFormatError,
    normalize_ref,
    read_prompt,
    template_variables,
)
from teacheragent.infrastructure.store import repositories

router = APIRouter(prefix="/prompts", tags=["prompts"])

ASSET_SOURCE: Final[str] = "asset"
"""正文取自当前文件版本。"""

SNAPSHOT_SOURCE: Final[str] = "snapshot"
"""正文取自历史快照版本。"""


@router.get("/{ref:path}/versions")
def list_prompt_versions(ref: str) -> dict[str, Any]:
    """列出该资产的版本序列（按追加时间升序），并标出当前文件是哪一版。"""
    prompt = _read_asset(ref)
    return {
        "ref": prompt.ref,
        "currentHash": prompt.content_hash,
        "versions": [
            {
                "contentHash": row["content_hash"],
                "addTime": row["add_time"],
                "isCurrent": row["content_hash"] == prompt.content_hash,
            }
            for row in repositories.prompt_snapshots.list_snapshots(ref=prompt.ref)
        ],
    }


@router.get("/{ref:path}/diff")
def diff_prompt_versions(
    ref: str,
    from_hash: str = Query(alias="from"),
    to_hash: str = Query(alias="to"),
) -> dict[str, Any]:
    """给出该资产任意两版之间的统一 diff；任一版本不在快照里则 404。"""
    normalized = _normalize(ref)
    left = _snapshot_or_404(normalized, from_hash)
    right = _snapshot_or_404(normalized, to_hash)
    lines = difflib.unified_diff(
        left["content"].splitlines(),
        right["content"].splitlines(),
        fromfile=from_hash,
        tofile=to_hash,
        lineterm="",
    )
    return {
        "ref": normalized,
        "from": from_hash,
        "to": to_hash,
        "changed": from_hash != to_hash,
        "unifiedDiff": "\n".join(lines),
    }


@router.get("/{ref:path}")
def get_prompt(ref: str, content_hash: str | None = None) -> dict[str, Any]:
    """取提示词正文与变量清单。

    默认返回当前文件版本；带 `contentHash` 时返回该历史版本的正文，供历史回放。
    """
    if content_hash is None:
        prompt = _read_asset(ref)
        return _payload(
            ref=prompt.ref,
            content_hash=prompt.content_hash,
            source=ASSET_SOURCE,
            content=prompt.content,
            current_hash=prompt.content_hash,
        )
    normalized = _normalize(ref)
    row = _snapshot_or_404(normalized, content_hash)
    return _payload(
        ref=normalized,
        content_hash=row["content_hash"],
        source=SNAPSHOT_SOURCE,
        content=row["content"],
        current_hash=_current_hash(normalized),
    )


def _payload(
    *,
    ref: str,
    content_hash: str,
    source: str,
    content: str,
    current_hash: str | None,
) -> dict[str, Any]:
    """一条提示词视图：正文、变量清单、内容身份与当前文件版本。"""
    return {
        "ref": ref,
        "contentHash": content_hash,
        "source": source,
        "variables": list(template_variables(content)),
        "template": content,
        "currentHash": current_hash,
    }


def _read_asset(ref: str) -> Prompt:
    """读当前文件版本；路径写法不合法报 400，资产不存在报 404。"""
    try:
        return read_prompt(ref)
    except PromptFormatError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=f"提示词资产不存在：{ref}") from error


def _normalize(ref: str) -> str:
    """只看路径形状地归一化 —— 历史版本在资产被删除后仍可读。"""
    try:
        return normalize_ref(ref)
    except PromptFormatError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def _snapshot_or_404(ref: str, content_hash: str) -> dict[str, Any]:
    """按内容身份取快照行，不存在即 404。"""
    row = repositories.prompt_snapshots.get_snapshot(ref=ref, content_hash=content_hash)
    if row is None:
        raise HTTPException(status_code=404, detail=f"提示词版本不存在：{ref}@{content_hash}")
    return dict(row)


def _current_hash(ref: str) -> str | None:
    """当前文件版本的内容身份；资产已被删除时为 None。"""
    try:
        return read_prompt(ref).content_hash
    except (FileNotFoundError, PromptFormatError):
        return None
