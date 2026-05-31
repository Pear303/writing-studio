"""会话管理 API — 会话的增删改查及历史记录获取"""
import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
HISTORY_FILE = PROJECT_ROOT / "memory" / "history.jsonl"
SESSIONS_FILE = PROJECT_ROOT / "memory" / "sessions.json"


def _load_sessions() -> list[dict]:
    """从 sessions.json 加载会话列表。"""
    if not SESSIONS_FILE.exists():
        return []
    try:
        with SESSIONS_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _save_sessions(sessions: list[dict]) -> None:
    """保存会话列表到 sessions.json。"""
    SESSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with SESSIONS_FILE.open("w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)


def _get_session_turns(session_id: str) -> list[dict]:
    """从 history.jsonl 获取指定会话的对话记录。"""
    if not HISTORY_FILE.exists():
        return []

    turns = []
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("session_id") != session_id:
                continue
            if "role" not in entry or "content" not in entry:
                continue
            content = entry.get("content", "")
            display_content = content[:200] + "..." if len(content) > 200 else content
            turns.append({
                "role": entry["role"],
                "content": display_content,
                "full_content": content,
                "timestamp": entry.get("ts", ""),
            })
    return turns


class CreateSessionRequest(BaseModel):
    title: str | None = None


class UpdateSessionRequest(BaseModel):
    title: str | None = None


@router.get("")
async def list_sessions():
    """获取所有会话列表，按 updated_at 倒序排列。"""
    sessions = _load_sessions()

    # 为每个会话计算轮次数和首条用户消息（用于自动标题）
    result = []
    for s in sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True):
        turns = _get_session_turns(s["id"])
        turn_count = sum(1 for t in turns if t["role"] == "user")
        # 取第一条用户消息作为摘要
        first_user = next((t["full_content"] for t in turns if t["role"] == "user"), None)
        result.append({
            "id": s["id"],
            "title": s.get("title", "新会话"),
            "created_at": s.get("created_at", ""),
            "updated_at": s.get("updated_at", ""),
            "turn_count": turn_count,
            "first_user_message": (first_user[:80] + "...") if first_user and len(first_user) > 80 else first_user,
        })
    return {"sessions": result}


@router.post("")
async def create_session(req: CreateSessionRequest = None):
    """创建新会话。"""
    from datetime import datetime, timezone, timedelta
    _UTC8 = timezone(timedelta(hours=8))
    import uuid

    now = datetime.now(_UTC8).isoformat(timespec="seconds")
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    title = (req.title if req else None) or "新会话"

    sessions = _load_sessions()
    session = {
        "id": session_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }
    sessions.append(session)
    _save_sessions(sessions)

    return {
        "id": session_id,
        "title": title,
        "created_at": now,
        "updated_at": now,
    }


@router.get("/{session_id}")
async def get_session(session_id: str):
    """获取指定会话的详情及对话记录。"""
    sessions = _load_sessions()
    session = None
    for s in sessions:
        if s["id"] == session_id:
            session = s
            break

    if session is None:
        return {"error": "会话不存在"}, 404

    turns = _get_session_turns(session_id)
    turn_count = sum(1 for t in turns if t["role"] == "user")

    return {
        "id": session["id"],
        "title": session.get("title", "新会话"),
        "created_at": session.get("created_at", ""),
        "updated_at": session.get("updated_at", ""),
        "turn_count": turn_count,
        "turns": turns,
    }


@router.patch("/{session_id}")
async def update_session(session_id: str, req: UpdateSessionRequest):
    """更新会话元数据（标题等）。"""
    from datetime import datetime, timezone, timedelta
    _UTC8 = timezone(timedelta(hours=8))

    sessions = _load_sessions()
    for s in sessions:
        if s["id"] == session_id:
            if req.title is not None:
                s["title"] = req.title
            s["updated_at"] = datetime.now(_UTC8).isoformat(timespec="seconds")
            _save_sessions(sessions)
            return {
                "id": s["id"],
                "title": s["title"],
                "created_at": s.get("created_at", ""),
                "updated_at": s["updated_at"],
            }
    return {"error": "会话不存在"}, 404


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """删除会话及其所有历史记录。"""
    sessions = _load_sessions()
    target = None
    for s in sessions:
        if s["id"] == session_id:
            target = s
            break

    if target is None:
        return {"error": "会话不存在"}

    # 从 history.jsonl 中删除该会话的记录
    if HISTORY_FILE.exists():
        remaining = []
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    remaining.append(line)
                    continue
                if entry.get("session_id") == session_id:
                    continue
                remaining.append(json.dumps(entry, ensure_ascii=False))

        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            for line in remaining:
                f.write(line + "\n")

    # 删除情景记忆文件
    episode_path = PROJECT_ROOT / "memory" / "episodes" / f"{session_id}.md"
    if episode_path.exists():
        episode_path.unlink()

    # 从 sessions.json 中删除
    sessions = [s for s in sessions if s["id"] != session_id]
    _save_sessions(sessions)

    return {"ok": True, "deleted": session_id}


# ── 兼容旧接口 ──────────────────────────────────────────────

@router.get("/legacy/by-date")
async def get_history_by_date():
    """按日期分组返回对话历史（兼容旧前端）。"""
    if not HISTORY_FILE.exists():
        return {"dates": []}

    entries = []
    with open(HISTORY_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    from collections import defaultdict
    dates_dict = defaultdict(list)
    for entry in entries:
        if "role" not in entry or "content" not in entry:
            continue
        ts = entry.get("ts", "")[:10]
        if not ts:
            ts = "unknown"
        content = entry.get("content", "")
        display_content = content[:200] + "..." if len(content) > 200 else content
        dates_dict[ts].append({
            "role": entry["role"],
            "content": display_content,
            "full_content": content,
            "timestamp": entry.get("ts", ""),
        })

    dates_list = []
    for date in sorted(dates_dict.keys(), reverse=True):
        turns = dates_dict[date]
        turn_count = sum(1 for t in turns if t["role"] == "user")
        dates_list.append({
            "date": date,
            "turns": turns,
            "turn_count": turn_count,
        })

    return {"dates": dates_list}
