@echo off
REM WIF / SOL pair
cd /d "%~dp0.."

set WIF=EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm
set SOL=So11111111111111111111111111111111111111112

echo Running raydium-cpmm-arb-monitor on WIF / SOL
echo Ctrl+C to exit. Logs to arb-monitor.log
echo.
call npm run dev -- %WIF% %SOL%
