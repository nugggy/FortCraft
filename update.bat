@echo off
rem Updates a git-installed copy of FortCraft to the latest version.
cd /d "%~dp0"
echo Fetching the latest FortCraft...
git pull --ff-only || (echo Update failed. If you downloaded a zip, grab the latest release from https://github.com/nugggy/FortCraft/releases/latest & pause & exit /b 1)
call npm install --omit=dev
echo.
echo Done. Run start.bat to play.
pause
