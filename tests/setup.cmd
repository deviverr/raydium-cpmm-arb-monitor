@echo off
REM Copy tests\.env.test to project root .env

set HERE=%~dp0
set ROOT=%HERE%..

if not exist "%HERE%.env.test" (
  echo ERROR: tests\.env.test not found. Create it with your RPC_ENDPOINT first.
  exit /b 1
)

copy /Y "%HERE%.env.test" "%ROOT%\.env" >nul
echo Copied tests\.env.test to .env
echo.
echo Now run any of: tests\run-*.cmd
