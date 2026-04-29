@echo off
REM Reset local state
cd /d "%~dp0.."

if exist .env del /q .env
if exist arb-monitor.log del /q arb-monitor.log
if exist dist rmdir /s /q dist
echo Cleaned: .env, arb-monitor.log, dist\
