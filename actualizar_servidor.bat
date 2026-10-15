@echo off
title Bot Manager - Actualizador Automatico
color 0a
echo ===================================================
echo       ACTUALIZANDO BOT DASHBOARD DESDE GITHUB
echo ===================================================
echo.
cd /d "%~dp0"

echo [1/3] Descargando ultimos cambios de GitHub...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo [ERROR] No se pudo descargar el codigo de GitHub.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Compilando nueva version del Frontend...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Fallo la compilacion del Frontend.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Reiniciando backend para aplicar cambios...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
start "" wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BotManager_AutoStart.vbs"

echo.
echo ===================================================
echo     ACTUALIZACION COMPLETADA CON EXITO (200 OK)
echo ===================================================
timeout /t 3
exit
