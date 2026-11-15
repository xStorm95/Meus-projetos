@echo off
REM ================================================================
REM   NEXUS BOOSTER - INSTALADOR DE 1 CLIQUE
REM   Duplo clique aqui. O script faz tudo sozinho:
REM   1) Verifica/instala o Python (se necessario)
REM   2) Prepara o ambiente (so na primeira vez)
REM   3) Abre o Nexus Booster
REM ================================================================
title Nexus Booster - Instalador
cd /d "%~dp0"

echo.
echo  =========================================================
echo    N E X U S   B O O S T E R
echo    Preparando o aplicativo (a primeira vez demora
echo    alguns minutos - baixa uns 200 MB de dependencias)
echo  =========================================================
echo.

REM ---------- 1) Localiza o Python --------------------------------
set "PYEXE="
where python >nul 2>nul && set "PYEXE=python"
if not defined PYEXE where py >nul 2>nul && set "PYEXE=py -3"

if not defined PYEXE (
    echo  [1/4] Python nao encontrado - baixando o Python 3.12...
    curl -L --progress-bar -o "%TEMP%\nexus-python.exe" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
    if errorlevel 1 (
        echo.
        echo  ERRO: nao foi possivel baixar o Python automaticamente.
        echo  Abra este site e instale o Python 3.12:
        echo      https://www.python.org/downloads/
        echo  IMPORTANTE: marque a opcao "Add python.exe to PATH".
        echo  Depois execute este arquivo de novo.
        echo.
        pause
        exit /b 1
    )
    echo        Instalando o Python ^| aguarde, pode levar alguns minutos...
    "%TEMP%\nexus-python.exe" /passive InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0
    if errorlevel 1 (
        echo        ERRO na instalacao do Python. Instale manualmente:
        echo        https://www.python.org/downloads/
        pause
        exit /b 1
    )
    REM recarrega o PATH da maquina/usuario
    set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    if not exist "%PYEXE%" set "PYEXE=python"
) else (
    echo  [1/4] Python encontrado.
)

REM Verifica versao minima (3.10+)
%PYEXE% -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul
if errorlevel 1 (
    echo        Aviso: Python antigo demais. Baixando o Python 3.12...
    curl -L --progress-bar -o "%TEMP%\nexus-python.exe" "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
    if not errorlevel 1 (
        "%TEMP%\nexus-python.exe" /passive InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0
        set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
        if not exist "%PYEXE%" set "PYEXE=python"
    )
)

REM ---------- 2) Cria o ambiente virtual (primeira vez) -----------
if not exist .venv (
    echo  [2/4] Criando ambiente virtual...
    %PYEXE% -m venv .venv
    if errorlevel 1 (
        echo  ERRO ao criar ambiente virtual.
        pause
        exit /b 1
    )
) else (
    echo  [2/4] Ambiente virtual OK.
)

call .venv\Scripts\activate.bat

REM ---------- 3) Instala dependencias (uma vez so) ---------------
if exist .venv\.deps-ok (
    echo  [3/4] Dependencias OK.
) else (
    echo  [3/4] Baixando dependencias... (primeira vez: 3 a 10 min)
    python -m pip install --upgrade pip -q
    pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo  ERRO ao instalar dependencias. Verifique sua internet
        echo  e execute este arquivo novamente.
        pause
        exit /b 1
    )
    echo ok> .venv\.deps-ok
)

REM ---------- 4) Abre o aplicativo --------------------------------
echo  [4/4] Abrindo o Nexus Booster...
echo.
python main.py
if errorlevel 1 (
    echo.
    echo  O aplicativo foi encerrado com erro. Veja o log em:
    echo  %%APPDATA%%\NexusBooster\logs\nexus.log
    pause
)
