@echo off
REM Stream the JSON log file. Run while the monitor is active in another terminal.
cd /d "%~dp0.."

if not exist arb-monitor.log (
  echo Log file not found: arb-monitor.log
  echo Start the monitor first ^(e.g., tests\run-sol-usdc.cmd^)
  exit /b 1
)

powershell -NoProfile -Command "Get-Content -Path 'arb-monitor.log' -Wait -Tail 20"
