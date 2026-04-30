@echo off
REM Run demo mode — no .env or RPC key needed.
REM Shows 3 synthetic pools with profitable arb opportunities.
cd /d "%~dp0.."

echo Running raydium-cpmm-arb-monitor in DEMO mode
echo No RPC key required. Ctrl+C to exit.
echo.
call npm run dev:demo
