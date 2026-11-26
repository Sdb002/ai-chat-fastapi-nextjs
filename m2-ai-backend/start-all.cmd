@echo off
rem Double-click to run the whole app:
rem   backend  (FastAPI) -> http://127.0.0.1:8000   (API docs at /docs)
rem   frontend (Next.js) -> http://localhost:3000
rem Each server opens in its own window. Close a window (or press Ctrl+C in it) to stop that server.

set "BACKEND=%~dp0."
set "FRONTEND=%~dp0..\m2-ai-frontend"

if not exist "%FRONTEND%\package.json" (
  echo Could not find the frontend at "%FRONTEND%".
  echo Expected m2-ai-frontend to sit next to m2-ai-backend, as in the repo.
  pause
  exit /b 1
)

rem --- first-run setup: Python virtualenv + packages ---
if not exist "%BACKEND%\.venv\Scripts\python.exe" (
  echo Setting up Python virtualenv...
  python -m venv "%BACKEND%\.venv" || (echo Python not found. Install Python 3.12+ first. & pause & exit /b 1)
)
rem Always sync packages: picks up new lines in requirements.txt (e.g. openai, added on m2d18). Fast when nothing changed.
"%BACKEND%\.venv\Scripts\python.exe" -m pip install -q -r "%BACKEND%\requirements.txt" || (pause & exit /b 1)

rem --- first-run setup: .env with a fresh random SECRET_KEY ---
if not exist "%BACKEND%\.env" (
  echo Creating .env...
  "%BACKEND%\.venv\Scripts\python.exe" -c "import secrets,pathlib; p=pathlib.Path(r'%BACKEND%'); t=(p/'.env.example').read_text(); (p/'.env').write_text(t.replace('SECRET_KEY=change-me','SECRET_KEY='+secrets.token_hex(32)))"
)

rem --- m2d18: the backend refuses to start without GROQ_API_KEY (regex "=." = key has at least one character) ---
findstr /r /b /c:"GROQ_API_KEY=." "%BACKEND%\.env" >nul || (
  echo.
  echo GROQ_API_KEY is missing from .env. Add this line to "%BACKEND%\.env" and run again:
  echo   GROQ_API_KEY=your-key-from-console.groq.com
  pause
  exit /b 1
)

rem --- first-run setup: frontend .env.local (fresh clones don't have one; lib/api.ts needs NEXT_PUBLIC_API_URL) ---
if not exist "%FRONTEND%\.env.local" (
  echo Creating frontend .env.local...
  copy "%FRONTEND%\.env.example" "%FRONTEND%\.env.local" >nul || (pause & exit /b 1)
)

rem --- first-run setup: frontend packages ---
if not exist "%FRONTEND%\node_modules" (
  echo Installing frontend packages...
  pushd "%FRONTEND%" && call npm install && popd
)

start "m2-ai backend :8000" /D "%BACKEND%" cmd /k ".venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
start "m2-ai frontend :3000" /D "%FRONTEND%" cmd /k "npm run dev"

echo Waiting for the servers to start...
timeout /t 8 /nobreak >nul
start "" "http://localhost:3000/register"
