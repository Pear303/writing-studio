"""FastAPI 后端服务器 — Agent Web 界面 API"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pathlib import Path

app = FastAPI(title="Agent Web API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.routes import chat, history, tokens, skills, memory, todo, pipeline, vibe_settings
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(history.router, prefix="/api/history", tags=["history"])
app.include_router(tokens.router, prefix="/api/tokens", tags=["tokens"])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"])
app.include_router(todo.router, prefix="/api/todo", tags=["todo"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(vibe_settings.router, prefix="/api/vibe-settings", tags=["vibe-settings"])

_agent_instance = None


def set_agent_instance(agent):
    global _agent_instance
    _agent_instance = agent
    chat.set_agent(agent)


def get_agent_instance():
    return _agent_instance


FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"


@app.get("/")
async def serve_frontend():
    if FRONTEND_INDEX.exists():
        return HTMLResponse(FRONTEND_INDEX.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Frontend not built. Run: cd frontend && npm run build</h1>")


if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")
