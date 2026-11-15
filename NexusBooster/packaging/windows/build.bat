@echo off
REM ============================================================
REM  Nexus Booster — Build do executável (.exe) para Windows
REM  Requisitos: Python 3.12+ e conexão com a internet (pip)
REM ============================================================
setlocal enabledelayedexpansion

set ROOT=%~dp0..\..
pushd "%ROOT%"

echo.
echo [1/5] Verificando Python...
python --version || (echo ERRO: Python nao encontrado no PATH. Instale Python 3.12+ & goto :fail)

echo.
echo [2/5] Criando ambiente virtual de build (.venv-build)...
if not exist .venv-build (
    python -m venv .venv-build || goto :fail
)
call .venv-build\Scripts\activate.bat || goto :fail

echo.
echo [3/5] Instalando dependencias...
python -m pip install --upgrade pip || goto :fail
pip install -r requirements.txt pyinstaller pillow numpy || goto :fail

echo.
echo [4/5] Gerando icone do aplicativo...
python tools\make_icon.py assets\icon.ico || (
    echo AVISO: falha ao gerar .ico — usando logo.svg direto.
)

echo.
echo [5/5] Compilando com PyInstaller...
pyinstaller --noconfirm --clean packaging\windows\nexusbooster.spec || goto :fail

echo.
if exist dist\NexusBooster.exe (
    echo ============================================================
    echo  SUCESSO: dist\NexusBooster.exe
    echo  Para gerar o instalador, execute packaging\installer\build_installer.bat
    echo ============================================================
) else (
    echo ERRO: executavel nao gerado.
    goto :fail
)
popd
endlocal
exit /b 0

:fail
echo.
echo BUILD FALHOU. Verifique as mensagens acima.
popd
endlocal
exit /b 1
