@echo off
title Bot Dashboard - Servidor en la Nube
color 0b
echo ===================================================
echo     INICIANDO BOT DASHBOARD A LA NUBE (CLOUDFLARE)
echo ===================================================
echo.
cd /d "%~dp0"

echo [1/2] Verificando compilacion del Frontend...
if not exist "frontend\dist\index.html" (
    echo Compilando Frontend...
    call npm run build
)

echo.
echo [2/2] Iniciando Backend y Tunel Cloudflare...
echo Copia el enlace HTTPS terminado en .trycloudflare.com que aparecera abajo:
echo ===================================================
echo.

npm run nube
pause
