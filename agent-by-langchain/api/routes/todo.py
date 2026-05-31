"""Todo API — 返回当前任务队列"""
import sys
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@router.get("")
async def get_todos():
    from api.routes.chat import _agent
    if _agent is None or _agent.todo_store is None:
        return {"todos": [], "total": 0}
    todos = _agent.todo_store.todos
    return {
        "todos": todos,
        "total": len(todos),
        "completed": sum(1 for t in todos if t["status"] == "completed"),
        "in_progress": sum(1 for t in todos if t["status"] == "in_progress"),
        "pending": sum(1 for t in todos if t["status"] == "pending"),
    }
