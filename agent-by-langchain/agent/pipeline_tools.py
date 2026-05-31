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

        return f"流水线已创建，ID={pipeline_id}，共 {len(steps)} 个步骤：{', '.join(step_names)}"
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
        step_info = f"步骤 {step_index}" + (f"「{step.name}」" if step else "")

        _push_sse_event("pipeline_step_" + ("start" if status == "running" else "complete"), {
            "step_index": step_index,
            "step_name": step.name if step else "",
            "status": status,
            "result": result or "",
            "message": f"{step_info} → {status}" + (f"：{result}" if result else ""),
        })

        if status == "completed" and step_index + 1 < len(state.steps):
            all_done = all(s.status in ("completed", "skipped") for s in state.steps)
            if all_done:
                state.status = "completed"
                mgr.save(state)
                _push_sse_event("pipeline_completed", {
                    "pipeline_id": state.id,
                    "message": "流水线全部步骤已完成",
                })

        return f"{step_info} 状态已更新为 {status}"
    except Exception as e:
        return f"更新进度失败: {e}"


@tool
def pipeline_self_check(step_name: str, content: str, criteria: str) -> str:
    """对当前步骤的产出进行自检，同时检查是否有干预信号。

    返回检查结果和干预信号（如果有）。

    Args:
        step_name: 当前步骤名称
        content: 待检查的内容
        criteria: 检查标准（简短描述）
    """
    try:
        mgr = _get_manager()
        state = mgr.load()

        intervention_msg = ""
        if state and state.intervention:
            iv = state.intervention
            intervention_msg = f"\n\n⚠️ 检测到干预信号：类型={iv.type}"
            if iv.message:
                intervention_msg += f"，消息={iv.message}"
            if iv.type == "pause":
                intervention_msg += "\n请立即暂停当前步骤，等待恢复信号。"
            elif iv.type == "cancel":
                intervention_msg += "\n请立即停止所有步骤。"
            elif iv.type == "redirect":
                intervention_msg += f"\n请调整方向：{iv.message}"
            elif iv.type == "skip":
                intervention_msg += f"\n请跳过当前步骤。"

            if iv.type in ("pause", "cancel"):
                return f"自检中断：检测到 {iv.type} 干预信号。{intervention_msg}"

        has_content = len(content.strip()) > 0
        basic_pass = has_content

        result_parts = [
            f"步骤：{step_name}",
            f"检查标准：{criteria}",
            f"内容长度：{len(content)} 字符",
            f"基本检查：{'通过' if basic_pass else '未通过（内容为空）'}",
        ]

        if intervention_msg and state and state.intervention and state.intervention.type == "redirect":
            state.intervention = None
            mgr.save(state)

        _push_sse_event("pipeline_check_result", {
            "step_name": step_name,
            "passed": basic_pass,
            "message": f"自检{'通过' if basic_pass else '未通过'}：{criteria}",
        })

        return "\n".join(result_parts) + intervention_msg
    except Exception as e:
        return f"自检失败: {e}"


@tool
def get_pipeline_status() -> str:
    """获取当前流水线的状态，包括所有步骤的进度和干预信号。"""
    try:
        mgr = _get_manager()
        state = mgr.load()
        if state is None:
            return "当前没有活跃的流水线"

        lines = [
            f"流水线 ID: {state.id}",
            f"状态: {state.status}",
            f"用户需求: {state.user_request}",
            f"当前步骤: {state.current_step_index}",
            "",
            "步骤列表：",
        ]
        for i, step in enumerate(state.steps):
            marker = "→" if i == state.current_step_index and state.status == "running" else " "
            status_icon = {"pending": "⏳", "running": "🔄", "completed": "✅", "failed": "❌", "skipped": "⏭️", "checking": "🔍"}.get(step.status, "?")
            lines.append(f"  {marker} {status_icon} [{i}] {step.name} - {step.status}")
            if step.result:
                lines.append(f"      结果: {step.result[:100]}")
            if step.retry_count > 0:
                lines.append(f"      重试: {step.retry_count} 次")

        if state.intervention:
            lines.append("")
            lines.append(f"⚠️ 干预信号: {state.intervention.type}")
            if state.intervention.message:
                lines.append(f"   消息: {state.intervention.message}")

        return "\n".join(lines)
    except Exception as e:
        return f"获取状态失败: {e}"
