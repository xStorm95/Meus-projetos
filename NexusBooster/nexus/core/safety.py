"""Regras de segurança: processos/serviços protegidos e validação de exclusões.

O Nexus Booster NUNCA permite:
- finalizar/suspender processos essenciais do Windows ou de segurança;
- desativar serviços de segurança (Defender, Firewall, Windows Update...);
- excluir arquivos fora das raízes aprovadas de limpeza;
- excluir documentos, saves de jogos ou configurações do usuário.
"""

from __future__ import annotations

from pathlib import Path

# Processos que jamais podem ser finalizados/suspensos.
PROTECTED_PROCESSES = {
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe",
    "services.exe", "lsass.exe", "lsm.exe", "svchost.exe", "dwm.exe", "explorer.exe",
    "fontdrvhost.exe", "sihost.exe", "ctfmon.exe", "conhost.exe", "dllhost.exe",
    "runtimebroker.exe", "searchindexer.exe", "spoolsv.exe", "audiodg.exe",
    "msmpeng.exe", "msascuil.exe", "nissrv.exe", "securityhealthservice.exe",
    "securityhealth.exe", "ntoskrnl.exe", "winlogon.exe", "memcompression",
    "searchapp.exe", "startmenuexperiencehost.exe", "shellexperiencehost.exe",
    "applicationframehost.exe", "useroom.exe", "wudfhost.exe", "backgroundtaskhost.exe",
    "python.exe", "pythonw.exe",  # o próprio app
}

# Serviços que jamais podem ser desativados/parados (segurança e essenciais).
PROTECTED_SERVICES = {
    "windefend", "wdnissvc", "wdboot", "wdfilter", "wdnpfilter", "mdcoreSvc",
    "mpssvc", "bfe", "wscsvc", "wuauserv", "bits", "cryptsvc", "trustedinstaller",
    "rpcss", "rpcss", "dcomlaunch", "lsm", "samss", "schedule", "eventlog",
    "dnscache", "dhcp", "lanmanserver", "lanmanworkstation", "nsi", "themes",
    "usermanager", "profsvc", "winmgmt", "audiosrv", "audioendpointbuilder",
    "power", "plugplay", "gpsvc", "mpssvc", "securityhealthservice", "sgrmbroker",
    "firewall", "sharedaccess", "trkwks", "sppsvc", "ndu", "sgrmagent",
}

# Extensões que jamais são apagadas por limpeza (documentos e mídia do usuário).
PROTECTED_EXTENSIONS = {
    ".doc", ".docx", ".odt", ".rtf", ".txt", ".pdf", ".xls", ".xlsx", ".ods",
    ".ppt", ".pptx", ".csv", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
    ".raw", ".cr2", ".nef", ".mp3", ".wav", ".flac", ".ogg", ".mp4", ".mkv",
    ".avi", ".mov", ".zip", ".rar", ".7z", ".tar", ".gz", ".exe", ".msi",
    ".sav", ".save", ".ini", ".cfg", ".json", ".xml", ".db", ".sqlite",
    ".psd", ".ai", ".indd", ".torrent", ".iso",
}

# Nomes/pastas que indicam saves e perfis de jogos — nunca tocados.
GAME_SAVE_MARKERS = (
    "saved games", "savegames", "saves", "my games", "profiles", "config",
    "screenshots", "replays", "mods", "userdata",
)


class SafetyError(RuntimeError):
    pass


def is_protected_process(name: str) -> bool:
    return (name or "").strip().lower() in PROTECTED_PROCESSES


def is_protected_service(name: str) -> bool:
    return (name or "").strip().lower() in PROTECTED_SERVICES


def has_protected_extension(path: Path) -> bool:
    return path.suffix.lower() in PROTECTED_EXTENSIONS


def path_has_game_save_marker(path: Path) -> bool:
    parts = {p.lower() for p in path.parts}
    return any(m in parts for m in GAME_SAVE_MARKERS)


def validate_delete_path(path: Path, allowed_roots: list[Path]) -> Path:
    """Garante que `path` está dentro de uma raiz aprovada, sem symlinks.

    Levanta SafetyError se o caminho não for seguro.
    """
    rp = path.resolve()
    for root in allowed_roots:
        rroot = root.resolve()
        try:
            rp.relative_to(rroot)
        except ValueError:
            continue
        else:
            if path_has_game_save_marker(rp):
                raise SafetyError(f"Caminho com dados de jogos protegidos: {rp}")
            return rp
    raise SafetyError(f"Caminho fora das áreas aprovadas de limpeza: {rp}")
