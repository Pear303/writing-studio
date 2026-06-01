@echo off
chcp 65001 >nul 2>&1
cmd /u /c "title Writing Studio + Agent Launcher"

echo ================================================
echo   Writing Studio + Agent Launcher
echo ================================================
echo.

set "ROOT=%~dp0"
set "AGENT_DIR=%ROOT%agent-by-langchain"

echo [1/2] Starting Agent Server (http://127.0.0.1:8000) ...
start "Agent Server" cmd /u /c "cd /d %AGENT_DIR% && F:\conda_env\langchain_agent_env\python.exe agent.py --web --no-browser"
timeout /t 3 /nobreak >nul

echo [2/2] Starting Writing Studio (Tauri dev) ...
cd /d "%ROOT%"
call npm run tauri dev

echo.
echo Writing Studio has exited.
echo To stop Agent Server, close the Agent Server window manually.
pause
