@echo off
REM SOL/USDC with debug logging + 2s polling
cd /d "%~dp0.."

set SOL=So11111111111111111111111111111111111111112
set USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

set LOG_LEVEL=debug
set POLLING_INTERVAL_MS=2000

echo Running in DEBUG mode: 2s polling, debug log level
echo Ctrl+C to exit. Logs to arb-monitor.log
echo.
call npm run dev -- %SOL% %USDC%
