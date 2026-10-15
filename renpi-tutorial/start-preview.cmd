@echo off
setlocal
set "PROJECT=%~dp0"
if not defined RENPY_HOME (
  echo ERROR: Set RENPY_HOME to your installed Ren'Py SDK directory.
  goto :fail
)
if not exist "%RENPY_HOME%\lib\py3-windows-x86_64\python.exe" (
  echo ERROR: Missing SDK Python under RENPY_HOME.
  goto :fail
)
if not exist "%PROJECT%authoring\checks\opening\game\opening.rpy" (
  echo ERROR: Isolated preview has not been staged. See authoring\handoff\opening-status.md.
  goto :fail
)
if /i "%~1"=="--test" (
  echo ERROR: E2E testing is disabled by user instruction. No engine will be launched.
  exit /b 1
)
echo MANUAL ISOLATED PREVIEW ONLY. No creation requests or adoption ACKs are sent.
"%RENPY_HOME%\lib\py3-windows-x86_64\python.exe" "%PROJECT%authoring\checks\run-sdk.py" "%PROJECT%authoring\checks\opening" --savedir "%PROJECT%authoring\checks\saves"
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" (
  echo ERROR: Preview exited with code %RESULT%. See authoring\checks\opening\log.txt.
  if /i not "%~1"=="--test" pause
)
exit /b %RESULT%
:fail
if /i not "%~1"=="--test" pause
exit /b 1
