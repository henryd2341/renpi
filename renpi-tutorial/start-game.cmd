@echo off
setlocal
set "PROJECT=%~dp0"
if exist "%PROJECT%.renpi-live\bridge\foundation.pending.json" (
  echo ERROR: Foundation installation is incomplete. Resume the recorded installation before starting.
  goto :fail
)
if not defined RENPY_HOME (
  echo ERROR: Set RENPY_HOME to your installed Ren'Py SDK directory.
  goto :fail
)
if not exist "%RENPY_HOME%\lib\py3-windows-x86_64\python.exe" (
  echo ERROR: Missing SDK Python under RENPY_HOME.
  goto :fail
)
if not exist "%RENPY_HOME%\renpy.py" (
  echo ERROR: Missing renpy.py under RENPY_HOME.
  goto :fail
)
findstr /r /c:"^label start:" "%PROJECT%game\*.rpy" >nul 2>nul
if errorlevel 1 (
  echo ERROR: The opening has not been adopted into game/ by the shared runtime.
  echo See authoring\handoff\opening-status.md. No files will be copied by this launcher.
  goto :fail
)
"%RENPY_HOME%\lib\py3-windows-x86_64\python.exe" "%RENPY_HOME%\renpy.py" "%PROJECT%."
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo ERROR: Ren'Py exited with code %RESULT%. See log.txt and traceback.txt in the project.
  if /i not "%~1"=="--no-pause" pause
)
exit /b %RESULT%
:fail
if /i not "%~1"=="--no-pause" pause
exit /b 1
