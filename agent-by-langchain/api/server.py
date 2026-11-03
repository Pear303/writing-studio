"""FastAPI 后端服务器 — Agent Web 界面 API"""
import os
import secrets
from pathlib import Path
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

app = FastAPI(title="Agent Web API", version="1.0.0")

# ── CORS：显式白名单（Vue dev: 5173，Tauri WebView: 1420 / tauri://localhost）──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API 鉴权 ──────────────────────────────────────────────────────
# 鉴权开关规则（保证向后兼容）：
#   - 环境变量 AGENT_API_TOKEN 已配置 → 强制校验 Authorization: Bearer <token>
#   - 未配置 → 跳过鉴权（允许空 token 直连）；此时仍按规范读取/生成 .api_token
#     文件作为文档化 token 并打印提示，用户可据此启用鉴权。
_AUTH_TOKEN: str | None = None


def _init_auth() -> None:
    """启动时初始化 API 鉴权。

    1. 环境变量 AGENT_API_TOKEN 配置了则必须校验，token 取该值；
    2. 未配置则跳过鉴权（向后兼容），并确保运行目录下存在 .api_token 文件
       （不存在则自动生成一个写入并打印提示），供用户后续启用鉴权使用。
    """
    global _AUTH_TOKEN
    token = os.environ.get("AGENT_API_TOKEN", "").strip()
    if token:
        _AUTH_TOKEN = token
        return
    # 未配置：确保 .api_token 文件存在（自动生成 + 打印提示）
    token_file = Path.cwd() / ".api_token"
    if not token_file.exists():
        try:
            token_file.write_text(secrets.token_urlsafe(32), encoding="utf-8")
            print(f"[WARN] 未配置 AGENT_API_TOKEN，已自动生成 API token 并写入 {token_file}")
            print("[WARN] 启用鉴权：设置环境变量 AGENT_API_TOKEN（建议值为上述 token），"
                  "并将同一 token 保存到前端 localStorage['agentApiToken'] 后重启服务")
        except OSError as e:
            print(f"[WARN] 写入 .api_token 失败: {e}，本次不启用 API 鉴权")
    _AUTH_TOKEN = None


_init_auth()


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """所有 /api 路由统一挂载的鉴权依赖。

    校验 Authorization: Bearer <token>（secrets.compare_digest 防时序攻击）。
    若 AGENT_API_TOKEN 未配置，跳过鉴权保证向后兼容（允许空 token 直连）。
    """
    if _AUTH_TOKEN is None:
        return
    provided = ""
    if authorization and authorization.startswith("Bearer "):
        provided = authorization[len("Bearer "):].strip()
    if not provided or not secrets.compare_digest(provided, _AUTH_TOKEN):
        raise HTTPException(status_code=401, detail="未授权：缺少或错误的 API token")


from api.routes import chat, history, tokens, skills, memory, todo, pipeline, vibe_settings, novel_import
app.include_router(chat.router, prefix="/api/chat", tags=["chat"], dependencies=[Depends(require_auth)])
app.include_router(history.router, prefix="/api/history", tags=["history"], dependencies=[Depends(require_auth)])
app.include_router(tokens.router, prefix="/api/tokens", tags=["tokens"], dependencies=[Depends(require_auth)])
app.include_router(skills.router, prefix="/api/skills", tags=["skills"], dependencies=[Depends(require_auth)])
app.include_router(memory.router, prefix="/api/memory", tags=["memory"], dependencies=[Depends(require_auth)])
app.include_router(todo.router, prefix="/api/todo", tags=["todo"], dependencies=[Depends(require_auth)])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"], dependencies=[Depends(require_auth)])
app.include_router(vibe_settings.router, prefix="/api/vibe-settings", tags=["vibe-settings"], dependencies=[Depends(require_auth)])
app.include_router(novel_import.router, prefix="/api/novel-import", tags=["novel-import"], dependencies=[Depends(require_auth)])

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
