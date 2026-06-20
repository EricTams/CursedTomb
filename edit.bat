@echo off
rem Launches the Cursed Tomb level editor: starts the Vite dev server and opens
rem the editor page in the browser. The editor (and its Save feature) only work
rem through the dev server, not by opening editor.html from disk. Close this
rem window to stop the server.
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

npm run dev -- --open /editor.html
pause
