@echo off
setlocal
node "%~dp0scripts\sync-upstream-cli.mjs" %*
exit /b %ERRORLEVEL%
