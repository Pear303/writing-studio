@echo off
echo ========================================
echo Project Cleanup Script
echo ========================================
echo.

echo [1/8] Cleaning Python cache...
if exist ".pytest_cache" rmdir /s /q ".pytest_cache"
for /d /r %%d in (__pycache__) do if exist "%%d" rmdir /s /q "%%d"
del /s /q *.pyc *.pyo *.egg-info >nul 2>&1
echo Done - Python cache cleaned

echo.
echo [2/8] Cleaning frontend dependencies (node_modules)...
if exist "node_modules" rmdir /s /q "node_modules"
echo Done - Frontend dependencies cleaned (reinstall with: npm install)

echo.
echo [3/8] Cleaning Python virtual environment...
if exist ".venv" rmdir /s /q ".venv"
echo Done - Virtual environment cleaned (recreate with: python -m venv .venv)

echo.
echo [4/8] Cleaning IDE and tool cache...
if exist ".vscode" rmdir /s /q ".vscode"
if exist ".sisyphus" rmdir /s /q ".sisyphus"
if exist ".claude" rmdir /s /q ".claude"
echo Done - IDE cache cleaned

echo.
echo [5/8] Cleaning temporary files...
if exist "-p" rmdir /s /q "-p"
if exist "node-output.txt" del /q "node-output.txt"
if exist "test-browser.js" del /q "test-browser.js"
del /s /q *.log >nul 2>&1
echo Done - Temporary files cleaned

echo.
echo [6/8] Optimizing Git repository (optional)...
echo Tip: To further reduce .git directory size, run:
echo   git gc --prune=now --aggressive
echo.

echo [7/8] Project structure after cleanup...
echo Core files retained:
echo   - Source code (agent/, api/, frontend/src/)
echo   - Config files (.env.example, requirements.txt, package.json)
echo   - Skill templates (skills/*/SKILL.md)
echo   - Prompt templates (templates/)
echo   - Test code (tests/)
echo   - Documentation (README.md)
echo.

echo [8/8] Setup instructions for recipients...
echo.
echo ========================================
echo Cleanup Complete! Project is ready to share
echo ========================================
echo.
echo Recipients need to run these steps:
echo   1. pip install -r requirements.txt
echo   2. cd frontend ^&^& npm install
echo   3. Copy .env.example to .env and add your API Key
echo   4. Run project: python agent.py or uvicorn api.server:app --reload
echo.
pause
