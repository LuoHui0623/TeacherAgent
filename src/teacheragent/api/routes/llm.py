"""LLM Profile 与模型目录 API。"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from teacheragent.constants import AgentRole
from teacheragent.services import llm
from teacheragent.shared import llm_client


router = APIRouter(prefix="/llm")


class ProfileRead(BaseModel):
    """Profile API 返回形状。"""

    profile_id: str
    model: str
    temperature: float
    active: int
    valid: int
    updated_at: str


class ProfileCreateRequest(BaseModel):
    """创建 Profile 请求。"""

    profile_id: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1)
    temperature: float


class ProfileUpdateRequest(BaseModel):
    """编辑 Profile 请求；不提供改名。"""

    model: str = Field(min_length=1)
    temperature: float


class ChatMessage(BaseModel):
    """一次模型调用的消息。"""

    role: str
    content: str


class LlmInvokeRequest(BaseModel):
    """一次模型调用请求。"""

    role: AgentRole
    messages: list[ChatMessage] = Field(min_length=1)


@router.get("/models")
def list_models() -> dict:
    """返回当前内存模型目录；只包含 model id。"""
    return {"models": llm.catalog.list_models()}


@router.post("/models/refresh")
def refresh_models() -> dict:
    """前端主动触发模型目录刷新；失败时保留旧目录。"""
    return llm.catalog.refresh_models()


@router.get("/roles/{role}/profiles")
def list_profiles(role: str) -> dict:
    """列出某角色 Profile 集合与当前激活 Profile。"""
    profiles = llm.profiles.list_profiles(role)
    return {
        "role": role,
        "profiles": [
            ProfileRead(
                profile_id=row["profile_id"],
                model=row["model"],
                temperature=row["temperature"],
                active=row["active"],
                valid=row["valid"],
                updated_at=row["updated_at"],
            ).model_dump()
            for row in profiles
        ],
    }


@router.post("/roles/{role}/profiles")
def create_profile(role: str, request: ProfileCreateRequest) -> dict:
    """创建角色 Profile。"""
    try:
        profile = llm.profiles.save_profile(
            role,
            request.profile_id,
            model=request.model,
            temperature=request.temperature,
            create=True,
        )
    except (ValueError, LookupError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _profile_payload(profile)


@router.put("/roles/{role}/profiles/{profile_id}")
def update_profile(
    role: str,
    profile_id: str,
    request: ProfileUpdateRequest,
) -> dict:
    """更新指定 Profile 的 model 和 temperature。"""
    try:
        profile = llm.profiles.save_profile(
            role,
            profile_id,
            model=request.model,
            temperature=request.temperature,
            create=False,
        )
    except (ValueError, LookupError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _profile_payload(profile)


@router.post("/roles/{role}/profiles/{profile_id}/activate")
def activate_profile(role: str, profile_id: str) -> dict:
    """切换当前激活 Profile。"""
    try:
        profile = llm.profiles.activate_profile(role, profile_id)
    except (ValueError, LookupError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _profile_payload(profile)


@router.delete("/roles/{role}/profiles/{profile_id}")
def delete_profile(role: str, profile_id: str) -> dict:
    """删除非激活 Profile。"""
    try:
        llm.profiles.delete_profile(role, profile_id)
    except (ValueError, LookupError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.post("/invoke")
def invoke(request: LlmInvokeRequest) -> dict:
    """执行一次真实模型调用，用于冒烟与前端触发验证。"""
    agent = llm.base_agent.BaseAgent(request.role)
    try:
        response = agent.invoke([message.model_dump() for message in request.messages])
    except Exception as exc:
        error = llm_client.describe_error(exc)
        raise HTTPException(status_code=502, detail=error) from exc
    return {
        "role": str(request.role),
        "content": response.content,
    }


def _profile_payload(profile: dict) -> dict:
    return ProfileRead(
        profile_id=profile["profile_id"],
        model=profile["model"],
        temperature=profile["temperature"],
        active=profile["active"],
        valid=profile["valid"],
        updated_at=profile["updated_at"],
    ).model_dump()
