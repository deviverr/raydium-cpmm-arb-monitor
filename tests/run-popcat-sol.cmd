@echo off
REM POPCAT / SOL pair
cd /d "%~dp0.."

set POPCAT=7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr
set SOL=So11111111111111111111111111111111111111112

echo Running raydium-cpmm-arb-monitor on POPCAT / SOL
echo Ctrl+C to exit. Logs to arb-monitor.log
echo.
call npm run dev -- %POPCAT% %SOL%
