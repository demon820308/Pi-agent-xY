@echo off
echo ==========================================
echo       Pi Core One-Click Updater
echo ==========================================
echo.
cd /d "%~dp0"
call npm run update-core
call npm run sync-ppt
echo.
echo ==========================================
echo Update completed! Press any key to exit...
pause > nul
