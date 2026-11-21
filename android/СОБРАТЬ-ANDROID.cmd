@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0build-windows.ps1"
set "lubimka_exit=%ERRORLEVEL%"
pause
exit /b %lubimka_exit%
