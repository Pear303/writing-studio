"""流水线状态管理 —— 持久化到 studio-data/pipeline_state.json，供编排器和前端共享。"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


@dataclass
class PipelineStep:
    id: str
    name: str
    description: str = ""
    status: str = "pending"
    subagent: Optional[str] = None
    result: Optional[str] = None
    check_result: Optional[str] = None
    retry_count: int = 0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


@dataclass
class PipelineIntervention:
    type: str = ""
    message: Optional[str] = None
    target_step_index: Optional[int] = None
    created_at: float = field(default_factory=time.time)


@dataclass
class PipelineState:
    id: str = ""
    book_id: str = ""
    volume_id: str = ""
    user_request: str = ""
    steps: list[PipelineStep] = field(default_factory=list)
    current_step_index: int = 0
    status: str = "planning"
    intervention: Optional[PipelineIntervention] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> PipelineState:
        steps = [PipelineStep(**s) for s in d.get("steps", [])]
        intervention = None
        if d.get("intervention"):
            intervention = PipelineIntervention(**d["intervention"])
        return cls(
            id=d.get("id", ""),
            book_id=d.get("book_id", ""),
            volume_id=d.get("volume_id", ""),
            user_request=d.get("user_request", ""),
            steps=steps,
            current_step_index=d.get("current_step_index", 0),
            status=d.get("status", "planning"),
            intervention=intervention,
            created_at=d.get("created_at", time.time()),
            updated_at=d.get("updated_at", time.time()),
        )


class PipelineStateManager:
    """线程安全的流水线状态管理器，读写 pipeline_state.json。"""

    def __init__(self, studio_data_dir: Path):
        self._path = studio_data_dir / "pipeline_state.json"
        self._lock = threading.Lock()

    def load(self) -> Optional[PipelineState]:
        with self._lock:
            if not self._path.exists():
                return None
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
                return PipelineState.from_dict(data)
            except Exception:
                return None

    def save(self, state: PipelineState) -> None:
        with self._lock:
            state.updated_at = time.time()
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(state.to_dict(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    def clear(self) -> None:
        with self._lock:
            if self._path.exists():
                self._path.unlink()

    def set_intervention(self, intervention_type: str, message: Optional[str] = None, target_step_index: Optional[int] = None) -> Optional[PipelineState]:
        state = self.load()
        if state is None:
            return None
        state.intervention = PipelineIntervention(
            type=intervention_type,
            message=message,
            target_step_index=target_step_index,
        )
        if intervention_type == "pause":
            state.status = "paused"
        elif intervention_type == "cancel":
            state.status = "cancelled"
        elif intervention_type == "resume":
            state.status = "running"
            state.intervention = None
        self.save(state)
        return state

    def update_step(self, step_index: int, status: str, result: Optional[str] = None) -> Optional[PipelineState]:
        state = self.load()
        if state is None:
            return None
        if step_index < 0 or step_index >= len(state.steps):
            return state
        step = state.steps[step_index]
        step.status = status
        if result is not None:
            step.result = result
        if status == "running":
            step.started_at = time.time()
        elif status in ("completed", "failed", "skipped"):
            step.completed_at = time.time()
        if status == "running":
            state.current_step_index = step_index
        self.save(state)
        return state


_pipeline_state_manager: Optional[PipelineStateManager] = None


def set_pipeline_state_manager(manager: PipelineStateManager) -> None:
    global _pipeline_state_manager
    _pipeline_state_manager = manager


def get_pipeline_state_manager() -> Optional[PipelineStateManager]:
    return _pipeline_state_manager
