@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SF ERP
node server.js --open
pause
