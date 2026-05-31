"""流水线进度 API —— 查询和控制写作流水线的状态。"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

from agent.pipeline_state import get_pipeline_state_manager


class InterventionRequest(BaseModel):
    type: str
    message: Optional[str] = None
    target_step_index: Optional[int] = None


class PipelineStartRequest(BaseModel):
    book_id: str
    volume_id: str
    user_request: str
    step_names: list[str]


@router.get("/status")
async def get_pipeline_status():
    mgr = get_pipeline_state_manager()
    if mgr is None:
        return {"status": "unavailable", "message": "PipelineStateManager 未初始化"}
    state = mgr.load()
    if state is None:
        return {"status": "idle", "message": "当前没有活跃的流水线"}
    return {
        "status": "active",
        "pipeline": state.to_dict(),
    }


@router.post("/intervene")
async def intervene_pipeline(request: InterventionRequest):
    mgr = get_pipeline_state_manager()
    if mgr is None:
        return {"success": False, "message": "PipelineStateManager 未初始化"}
    state = mgr.set_intervention(
        intervention_type=request.type,
        message=request.message,
        target_step_index=request.target_step_index,
    )
    if state is None:
        return {"success": False, "message": "当前没有活跃的流水线"}
    return {
        "success": True,
        "pipeline_status": state.status,
        "intervention": {
            "type": request.type,
            "message": request.message,
        } if state.intervention else None,
    }


@router.post("/clear")
async def clear_pipeline():
    mgr = get_pipeline_state_manager()
    if mgr is None:
        return {"success": False, "message": "PipelineStateManager 未初始化"}
    mgr.clear()
    return {"success": True, "message": "流水线状态已清除"}
