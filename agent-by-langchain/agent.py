"""Agent 入口 —— 支持 REPL 和 Web 两种模式"""
from __future__ import annotations

import sys
import argparse

if sys.platform == "win32":
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

from agent.lc_agent import LCAgent


def run_repl():
    agent = LCAgent(model="deepseek-v4-flash", max_iterations=50)
    agent.run()


def run_web(host="127.0.0.1", port=8000, open_browser=True):
    import uvicorn
    from api.server import app, set_agent_instance

    agent = LCAgent(model="deepseek-v4-flash", max_iterations=50)
    set_agent_instance(agent)

    if open_browser:
        import webbrowser
        import threading
        threading.Timer(2.0, lambda: webbrowser.open(f"http://{host}:{port}")).start()

    print(f"[Web] Starting Agent Web API at http://{host}:{port}")
    print(f"[Web] Open your browser to access the interface")

    uvicorn.run(
        app, host=host, port=port, log_level="info",
        server_header=False,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LangChain Agent")
    parser.add_argument("--web", action="store_true", help="启动 Web 服务器模式")
    parser.add_argument("--host", default="127.0.0.1", help="服务器地址")
    parser.add_argument("--port", type=int, default=8000, help="服务器端口")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")

    args = parser.parse_args()

    if args.web:
        run_web(host=args.host, port=args.port, open_browser=not args.no_browser)
    else:
        run_repl()
