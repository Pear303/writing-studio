"""Memory API — 读写 MEMORY.md 和 USER.md"""
import sys
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

MEMORY_FILE = PROJECT_ROOT / "memory" / "MEMORY.md"
USER_FILE = PROJECT_ROOT / "templates" / "USER.md"


class ContentRequest(BaseModel):
    content: str


@router.get("/long-term")
async def get_long_term_memory():
    """读取长期记忆"""
    if not MEMORY_FILE.exists():
        return {"content": ""}
    return {"content": MEMORY_FILE.read_text(encoding="utf-8")}


@router.put("/long-term")
async def update_long_term_memory(request: ContentRequest):
    """更新长期记忆"""
    MEMORY_FILE.write_text(request.content.strip() + "\n", encoding="utf-8")
    return {"status": "ok", "message": "长期记忆已更新"}


@router.get("/user")
async def get_user_profile():
    """读取用户偏好"""
    if not USER_FILE.exists():
        return {"content": ""}
    return {"content": USER_FILE.read_text(encoding="utf-8")}


@router.put("/user")
async def update_user_profile(request: ContentRequest):
    """更新用户偏好"""
    USER_FILE.write_text(request.content.strip() + "\n", encoding="utf-8")
    return {"status": "ok", "message": "用户偏好已更新"}


@router.get("/episodes")
async def get_episodes():
    """获取情景记忆文件列表"""
    memory_dir = PROJECT_ROOT / "memory"
    episodes = []
    for f in sorted(memory_dir.glob("*.md"), reverse=True):
        if f.name == "MEMORY.md":
            continue
        episodes.append({
            "date": f.stem,
            "name": f.name,
            "size": f.stat().st_size,
        })
    return {"episodes": episodes}


@router.get("/episodes/{date}")
async def get_episode(date: str):
    """获取指定日期的情景记忆"""
    episode_file = PROJECT_ROOT / "memory" / f"{date}.md"
    if not episode_file.exists():
        return {"content": "", "error": "未找到该日期的情景记忆"}
    return {"date": date, "content": episode_file.read_text(encoding="utf-8")}
