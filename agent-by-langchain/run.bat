@echo off
cd /d "%~dp0"
taskkill /F /IM python.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul
echo Starting Agent Web Interface...
python agent.py --web
pause
