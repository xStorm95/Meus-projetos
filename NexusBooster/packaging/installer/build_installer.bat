@echo off
REM ============================================================
REM  Nexus Booster — Geração do instalador (Inno Setup)
REM  Pré-requisito: executar packaging\windows\build.bat antes
REM ============================================================
setlocal

set ROOT=%~dp0..\..
pushd "%ROOT%"

where iscc >nul 2>nul
if errorlevel 1 (
    if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
        set ISCC="%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
    ) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
        set ISCC="%ProgramFiles%\Inno Setup 6\ISCC.exe"
    ) else (
        echo ERRO: Inno Setup 6 nao encontrado.
        echo Baixe em: https://jrsoftware.org/isdl.php
        goto :fail
    )
) else (
    set ISCC=iscc
)

if not exist dist\NexusBooster.exe (
    echo ERRO: dist\NexusBooster.exe nao encontrado.
    echo Execute primeiro: packaging\windows\build.bat
    goto :fail
)

if not exist assets\icon.ico (
    echo Gerando icone...
    .venv-build\Scripts\python.exe tools\make_icon.py assets\icon.ico || goto :fail
)

echo Compilando instalador...
%ISCC% packaging\installer\nexusbooster.iss || goto :fail

echo.
echo ============================================================
echo  INSTALADOR GERADO: installer_output\DK-Setup-1.5.0.exe
echo ============================================================
popd
endlocal
exit /b 0

:fail
popd
endlocal
exit /b 1
