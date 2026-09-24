@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo          ABDSharedAssets — Demo Server
echo =======================================================

REM Try pnpm/vite first (preferred)
where pnpm >nul 2>&1
if not errorlevel 1 (
    echo [1/2] Iniciando Vite dev server...
    pnpm --dir .. demo
    goto done
)

REM Fallback: simple static server via Python
where python >nul 2>&1
if not errorlevel 1 (
    echo [1/2] Iniciando servidor HTTP basico (Python)...
    python -m http.server 8931
    goto done
)

REM Fallback: node serve-demo.mjs
where node >nul 2>&1
if not errorlevel 1 (
    echo [1/2] Iniciando servidor Node (serve-demo.mjs)...
    node ..\serve-demo.mjs 8931
    goto done
)

echo [ERROR] No se encontro pnpm, python, ni node en PATH.
echo Instala uno de ellos para servir la demo.
pause
exit /b 1

:done
echo.
echo Demo disponible en: http://localhost:5200/demo/demo.html (Vite)
echo                     http://localhost:8931/demo/demo.html (Python/Node)
pause