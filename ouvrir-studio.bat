@echo off
setlocal
cd /d "%~dp0"
title Minecraft Creator Studio
where.exe node >nul 2>&1
if errorlevel 1 goto missingnode
if not exist "node_modules\tsx\package.json" goto install
if not exist "node_modules\three\package.json" goto install
goto launch
:install
echo Installation des dependances...
call npm.cmd ci --include=dev --no-audit --no-fund
if errorlevel 1 goto failed
:launch
set "MCSTUDIO_PORT="
for /f "delims=" %%P in ('node tools\find-port.cjs') do set "MCSTUDIO_PORT=%%P"
if not defined MCSTUDIO_PORT goto porterror
echo.
echo Ouvrez http://127.0.0.1:%MCSTUDIO_PORT%/ dans votre navigateur.
echo Gardez cette fenetre ouverte. Ctrl+C pour arreter.
echo.
if /i "%~1"=="--check" goto check
node --import tsx src/server/index.ts
goto finished
:check
node --import tsx -e "const D=require('better-sqlite3');const db=new D(':memory:');db.close();console.log('Diagnostic OK : TypeScript et SQLite');"
exit /b %errorlevel%
:missingnode
echo Node.js est necessaire. Installez-le depuis https://nodejs.org/
goto finished
:failed
echo Installation impossible. Consultez les messages ci-dessus.
:finished
echo.
echo Le serveur est arrete. Les erreurs eventuelles restent visibles ci-dessus.
pause
exit /b
:porterror
echo Impossible de trouver un port libre.
pause
exit /b 1
