@echo off
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
pushd "%ROOT%"
set "BACKEND=%ROOT%backend"
set "FRONT=%ROOT%frontend"
set "VENV=%BACKEND%\.venv"
set "PY=%VENV%\Scripts\python.exe"
call :ensure_python || goto :eof
call :ensure_frontend || goto :eof
call :start_services
goto :eof

:ensure_python
if not exist "%VENV%" (
  echo creating venv
  python -m venv "%VENV%" || (echo failed to create venv & exit /b 1)
)
echo installing backend dependencies
"%PY%" -m pip install --upgrade pip >nul
"%PY%" -m pip install -r "%BACKEND%\requirements.txt" || (echo [error] pip install failed & exit /b 1)
exit /b 0

:ensure_frontend
if not exist "%FRONT%\node_modules" (
  echo installing frontend dependencies
  pushd "%FRONT%"
  npm install || (popd & echo npm install failed & exit /b 1)
  popd
)
exit /b 0

:start_services
echo.
echo backend -> http://localhost:8000
start "telemetry-backend" /D "%ROOT%" "%PY%" -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
echo frontend -> http://localhost:1337
start "telemetry-frontend" /D "%FRONT%" cmd /K "npm run dev -- --host 0.0.0.0 --port 1337"
echo.
echo dashboard http://localhost:1337
echo api       http://localhost:8000
exit /b 0

