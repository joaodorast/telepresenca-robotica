@echo off
rem Atalho para o modo rede local: instala as dependencias na primeira vez e inicia tudo.
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist server\node_modules call npm --prefix server install
call npm run lan
pause
