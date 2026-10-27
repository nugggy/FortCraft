@echo off
rem Builds the FortCraft Android APK into mobile\dist\FortCraft.apk
rem Needs Android Studio (for the SDK and its bundled Java) and Node.js.
cd /d "%~dp0"
if not exist node_modules\@capacitor\android (
  echo Installing Capacitor...
  call npm install
)
node build.mjs
pause
