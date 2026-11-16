; ============================================================
;  DK — Instalador profissional (Inno Setup 6+)
;  Gera: DK-Setup-1.5.0.exe
;
;  Como usar:
;    1. Instale o Inno Setup 6 (https://jrsoftware.org/isinfo.php)
;    2. Gere o executável com packaging\windows\build.bat
;    3. Compile este script (linha de comando abaixo ou pela IDE do Inno)
;       iscc packaging\installer\nexusbooster.iss
; ============================================================

#define MyAppName "DK"
#define MyAppVersion "1.5.0"
#define MyAppPublisher "DK"
#define MyAppExeName "DK.exe"
#define MyAppId "{{8E7B3C2A-9F4D-4C1E-B6A5-NEXUSBOOSTER1}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\DK
DefaultGroupName=DK
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=..\..\installer_output
OutputBaseFilename=DK-Setup-{#MyAppVersion}
; Versão 1.0.1: corrige falha de inicialização em builds sem console
; (sys.stderr None / faulthandler) — veja nexus/app.py::_ensure_streams.
SetupIconFile=..\..\assets\icon.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
ArchitecturesAllowed=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
LicenseFile=..\..\LICENSE
; Atualizações: versões futuras apenas aumentam MyAppVersion —
; o AppId fixo garante atualização limpa por cima da instalação anterior.

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "runatstartup"; Description: "Iniciar o DK com o Windows (opcional)"; GroupDescription: "Opções:"; Flags: unchecked

[Files]
Source: "..\..\dist\DK.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\assets\logo.svg"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; DestName: "Manual de utilizacao.md"; Flags: ignoreversion
; NOTE: adicione aqui arquivos futuros (ex.: PresentMon opcional embutido)

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Manual de utilizacao"; Filename: "{app}\Manual de utilizacao.md"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Inicialização opcional com o Windows (reversível pelo próprio app)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "DK"; \
    ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: runatstartup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; \
    Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Remove apenas dados do app criados pelo instalador; os dados do usuário
; (%APPDATA%\NexusBooster) são preservados por segurança.
Type: files; Name: "{app}\*.log"

[Messages]
brazilianportuguese.WelcomeLabel2=Este assistente instalará o [name/ver] no seu computador.%n%nRecomenda-se fechar outros aplicativos antes de continuar.
