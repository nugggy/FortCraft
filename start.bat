@echo off
rem Starts the FortCraft server and opens the game in your browser.
cd /d "%~dp0"
if not exist node_modules\ws (
  echo Installing dependencies...
  call npm install
)
start "" http://localhost:8080
node server.js 8080
pause
