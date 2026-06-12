@echo off
rem Launches Cursed Tomb: starts the Vite dev server and opens the game in
rem the browser. Close this window to stop the game.
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo npm install failed.
        pause
        exit /b 1
    )
)

npm run dev -- --open
pause
