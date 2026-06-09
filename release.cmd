@echo off
setlocal
node "%~dp0electron-app\scripts\release.mjs" %*
exit /b %ERRORLEVEL%
