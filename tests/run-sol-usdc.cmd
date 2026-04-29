@echo off
REM SOL / USDC pair
cd /d "%~dp0.."

set SOL=So11111111111111111111111111111111111111112
set USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

echo Running raydium-cpmm-arb-monitor on SOL / USDC
echo Ctrl+C to exit. Logs to arb-monitor.log
echo.
call npm run dev -- %SOL% %USDC%
