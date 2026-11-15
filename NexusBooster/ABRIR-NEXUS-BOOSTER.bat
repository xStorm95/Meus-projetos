@echo off
REM ==============================================
REM   NEXUS BOOSTER - ABRIR (dia a dia)
REM   Duplo clique aqui para abrir o aplicativo.
REM   Na primeira vez, execute INSTALAR-E-ABRIR.bat
REM ==============================================
title Nexus Booster
cd /d "%~dp0"

if not exist .venv (
    echo Primeira vez aqui? Execute INSTALAR-E-ABRIR.bat
    pause
    exit /b 1
)

call .venv\Scripts\activate.bat
python main.py
if errorlevel 1 (
    echo.
    echo  O aplicativo foi encerrado com erro. Veja:
    echo  %%APPDATA%%\NexusBooster\logs\nexus.log
    pause
)
