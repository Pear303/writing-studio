"""流水线编排工具 —— 供 pipeline_orchestrator 子代理使用的进度更新和自检工具。"""
from __future__ import annotations

import json
import time
import uuid
from typing import Optional

from langchain_core.tools import tool

from .pipeline_state import (
    PipelineStep,
    PipelineState,
    get_pipeline_state_manager,
)


def _get_manager():
    mgr = get_pipeline_state_manager()
    if mgr is None:
        raise RuntimeError("PipelineStateManager 未初始化")
    return mgr


def _push_sse_event(event_type: str, data: dict) -> None:
    """向 SSE 事件流推送流水线事件（如果 chat state 可用）。"""
    try:
        from .lc_tools import _chat_state_ref
        if _chat_state_ref is None:
            return
        state, lock = _chat_state_ref
        with lock:
            state["events"].append({
                "type": event_type,
                **data,
            })
    except Exception:
        pass


@tool
def start_pipeline(book_id: str, volume_id: str, user_request: str, step_names: list[str]) -> str:
    """启动一个新的写作流水线。创建流水线状态，定义步骤列表。

    Args:
        book_id: 书籍 ID
        volume_id: 目标分卷 ID
        user_request: 用户的写作需求描述
        step_names: 规划的步骤名称列表，如 ["需求分析", "生成大纲", "生成细纲", "撰写正文", "一致性检查", "质量审阅"]
    """
    try:
        mgr = _get_manager()
        pipeline_id = f"pipeline_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        steps = [
            PipelineStep(
                id=f"step_{i}",
                name=name,
                status="pending",
            )
            for i, name in enumerate(step_names)
        ]
        state = PipelineState(
            id=pipeline_id,
            book_id=book_id,
            volume_id=volume_id,
            user_request=user_request,
            steps=steps,
            current_step_index=0,
            status="running",
        )
        mgr.save(state)

        _push_sse_event("pipeline_started", {
            "pipeline_id": pipeline_id,
            "book_id": book_id,
            "volume_id": volume_id,
            "user_request": user_request,
            "steps": [{"name": s.name, "status": s.status} for s in steps],
            "message": f"流水线已启动：{len(steps)} 个步骤",
        })

        return f"流水线已创建(ID={pipeline_id})，{len(steps)}步：{', '.join(step_names)}"
    except Exception as e:
        return f"启动流水线失败: {e}"


@tool
def update_pipeline_progress(step_index: int, status: str, result: Optional[str] = None) -> str:
    """更新流水线中某个步骤的进度状态。

    Args:
        step_index: 步骤索引（从0开始）
        status: 步骤状态，可选值：running / completed / failed / skipped / checking
        result: 步骤结果摘要（可选）
    """
    try:
        mgr = _get_manager()
        state = mgr.update_step(step_index, status, result)
        if state is None:
            return "流水线状态不存在，请先调用 start_pipeline"

        step = state.steps[step_index] if step_index < len(state.steps) else None
        step_info = f"步骤{step_index}" + (f"「{step.name}」" if step else "")

        _push_sse_event("pipeline_step_" + ("start" if status == "running" else "complete"), {
            "step_index": step_index,
            "step_name": step.name if step else "",
            "status": status,
            "result": result or "",
            "message": f"{step_info} → {status}" + (f"：{result}" if result else ""),
        })

        if status in ("completed", "failed", "skipped"):
            all_done = all(s.status in ("completed", "skipped") for s in state.steps)
            if all_done:
                state.status = "completed"
                mgr.save(state)
                _push_sse_event("pipeline_completed", {
                    "pipeline_id": state.id,
                    "message": "流水线全部步骤已完成",
                })

        return f"{step_info}→{status}"
    except Exception as e:
        return f"更新进度失败: {e}"


@tool
def pipeline_self_check(step_name: str, content: str, criteria: str) -> str:
    """对当前步骤的产出进行自检，同时检查是否有干预信号。

    **性能提示**：content 参数只传摘要（500字以内），不要传完整正文。
    本工具主要功能是检查干预信号，基本质量检查只判断内容是否为空。

    Args:
        step_name: 当前步骤名称
        content: 待检查的内容摘要（控制在 500 字以内，不要传完整正文）
        criteria: 检查标准（简短描述）
    """
    try:
        mgr = _get_manager()
        state = mgr.load()

        if state and state.intervention:
            iv = state.intervention
            if iv.type in ("pause", "cancel"):
                msg = f"⚠️ 干预信号: {iv.type}"
                if iv.message:
                    msg += f" — {iv.message}"
                if iv.type == "pause":
                    msg += " 请暂停。"
                else:
                    msg += " 请停止。"
                return msg

            if iv.type == "redirect":
                msg = f"⚠️ 修改方向: {iv.message}" if iv.message else "⚠️ 修改方向"
                state.intervention = None
                mgr.save(state)
                return msg

            if iv.type == "skip":
                msg = "⚠️ 跳过当前步骤"
                state.intervention = None
                mgr.save(state)
                return msg

        passed = len(content.strip()) > 0
        _push_sse_event("pipeline_check_result", {
            "step_name": step_name,
            "passed": passed,
            "message": f"自检{'通过' if passed else '未通过'}：{criteria}",
        })

        return f"✅ {step_name}: {'通过' if passed else '未通过(内容为空)'}" if passed else f"❌ {step_name}: 未通过(内容为空)"
    except Exception as e:
        return f"自检失败: {e}"


@tool
def get_pipeline_status() -> str:
    """获取当前流水线的状态，包括所有步骤的进度和干预信号。"""
    try:
        mgr = _get_manager()
        state = mgr.load()
        if state is None:
            return "无活跃流水线"

        lines = [f"流水线{state.id} 状态={state.status} 当前步骤={state.current_step_index}"]
        for i, step in enumerate(state.steps):
            marker = "→" if i == state.current_step_index and state.status == "running" else " "
            icon = {"pending": "⏳", "running": "🔄", "completed": "✅", "failed": "❌", "skipped": "⏭️", "checking": "🔍"}.get(step.status, "?")
            line = f" {marker}{icon}[{i}]{step.name}-{step.status}"
            if step.result:
                line += f" ({step.result[:60]})"
            lines.append(line)

        if state.intervention:
            lines.append(f"⚠️干预:{state.intervention.type}" + (f" {state.intervention.message}" if state.intervention.message else ""))

        return "\n".join(lines)
    except Exception as e:
        return f"获取状态失败: {e}"
