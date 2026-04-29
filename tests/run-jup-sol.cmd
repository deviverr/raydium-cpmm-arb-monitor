@echo off
REM JUP / SOL pair
cd /d "%~dp0.."

set JUP=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
set SOL=So11111111111111111111111111111111111111112

echo Running raydium-cpmm-arb-monitor on JUP / SOL
echo Ctrl+C to exit. Logs to arb-monitor.log
echo.
call npm run dev -- %JUP% %SOL%
