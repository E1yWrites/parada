@echo off
rem PARADA offline launcher - double-click, or: run-offline.cmd [start|simulate|test|check|prepare|status|stop]
setlocal
cd /d "%~dp0"
set "PSHOST=powershell.exe"
where pwsh.exe >nul 2>nul && set "PSHOST=pwsh.exe"
"%PSHOST%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\offline\parada-offline.ps1" %*
set "RC=%ERRORLEVEL%"
if "%~1"=="" pause
exit /b %RC%
