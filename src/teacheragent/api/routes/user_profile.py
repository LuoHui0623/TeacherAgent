"""用户画像版本 API：读取、保存与恢复。"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from teacheragent.infrastructure.store.sqlite.repositories import user_profiles as repo

router = APIRouter(prefix="/user-profile", tags=["user-profile"])


class UserProfileVersionRead(BaseModel):
    """一个画像 Markdown 版本。"""

    id: str
    user_key: str
    content: str
    content_hash: str
    created_at: str


class UserProfileSaveRequest(BaseModel):
    """保存新画像版本。"""

    content: str = Field(default="")


@router.get("/versions")
def list_versions(user_key: str = repo.DEFAULT_USER_KEY) -> dict:
    """列出当前保留的全部版本；当前版本为列表第一项。"""
    versions = [_payload(row) for row in repo.list_versions(user_key)]
    return {
        "current": versions[0] if versions else None,
        "versions": versions,
    }


@router.put("/current")
def save_current(request: UserProfileSaveRequest) -> dict:
    """保存画像 Markdown，并返回新生成的当前版本。"""
    row = repo.save_version(repo.DEFAULT_USER_KEY, request.content)
    return _payload(row)


@router.post("/versions/{version_id}/restore")
def restore_version(version_id: str) -> dict:
    """把历史版本复制为新的当前版本。"""
    source = repo.get(version_id)
    if source is None:
        raise HTTPException(status_code=404, detail="画像版本不存在")
    row = repo.save_version(source["user_key"], source["content"])
    return _payload(row)


def _payload(row: dict) -> dict:
    return UserProfileVersionRead(
        id=row["id"],
        user_key=row["user_key"],
        content=row["content"],
        content_hash=row["content_hash"],
        created_at=row["created_at"],
    ).model_dump()
