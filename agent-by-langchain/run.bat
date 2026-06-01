@echo off
cd /d "%~dp0"
echo ================================================
echo   Agent Server Only
echo   (To launch Writing Studio, run run.bat in the project root instead)
echo ================================================
echo.
taskkill /F /IM python.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting Agent Server (langchain_agent_env) ...
F:\conda_env\langchain_agent_env\python.exe agent.py --web --no-browser
pause
