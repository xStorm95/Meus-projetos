"""Gerenciamento de aplicativos de inicialização do Windows — reversível.

Fontes: chaves Run (HKCU/HKLM), pastas Inicializar do usuário e comum.
Desativar move o item para uma área de backup (registro ou pasta), sem excluir.
O backup guarda a origem exata (hive/caminho) para restauração fiel.
"""

from __future__ import annotations

import json
import logging
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from nexus.core.paths import backup_dir
from nexus.system import registry_utils as reg

log = logging.getLogger("nexus.startup")

RUN_SOURCES = {
    "hkcu_run": ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    "hklm_run": ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    "hklm_run_wow": ("HKLM", r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run"),
}
BACKUP_KEY = r"Software\NexusBooster\StartupBackup"


@dataclass
class StartupItem:
    name: str
    command: str
    source: str            # hkcu_run | hklm_run | hklm_run_wow | folder_user | folder_common
    enabled: bool
    exe_path: str = ""
    impact: str = "médio"  # estimativa honesta exibida como tal

    @property
    def source_label(self) -> str:
        return {
            "hkcu_run": "Registro (usuário)",
            "hklm_run": "Registro (máquina)",
            "hklm_run_wow": "Registro (32 bits)",
            "folder_user": "Pasta Inicializar",
            "folder_common": "Pasta Inicializar (todos)",
        }.get(self.source, self.source)


# Estimativa de impacto com base em apps conhecidos (exibida como estimativa).
_KNOWN_IMPACT = {
    "onedrive": "alto", "steam": "médio", "discord": "médio", "spotify": "médio",
    "epicgameslauncher.exe": "médio", "skype": "alto", "teams": "alto",
    "adobe": "alto", "armsvc": "baixo", "securityhealth": "alto",
    "rtkauduoservice": "baixo", "nvidia": "baixo", "razer": "médio",
    "logitech": "médio", "corsair": "médio", "msedge": "médio", "chrome": "médio",
    "dropbox": "médio", "googleupdate": "baixo", "acrotray": "médio",
}
_PROTECTED_STARTUP = ("securityhealth", "windowsdefender")


def _impact_for(name: str, command: str) -> str:
    low = f"{name} {command}".lower()
    for token, impact in _KNOWN_IMPACT.items():
        if token in low:
            return impact
    return "médio"


def _is_protected(name: str, command: str) -> bool:
    low = f"{name} {command}".lower()
    return any(t in low for t in _PROTECTED_STARTUP)


def _startup_folders() -> list[tuple[str, Path]]:
    import os

    folders = []
    appdata = os.environ.get("APPDATA")
    programdata = os.environ.get("ProgramData")
    if appdata:
        folders.append(
            ("folder_user", Path(appdata) / "Microsoft/Windows/Start Menu/Programs/Startup")
        )
    if programdata:
        folders.append(
            ("folder_common", Path(programdata) / "Microsoft/Windows/Start Menu/Programs/StartUp")
        )
    return folders


def _exe_from_command(command: str) -> str:
    s = command.strip()
    if s.startswith('"'):
        end = s.find('"', 1)
        if end > 0:
            return s[1:end]
    return s.split(" ")[0] if s else ""


def _read_backups() -> dict[str, dict]:
    """Itens desativados pelo Nexus Booster: {nome: {command, source}}."""
    out: dict[str, dict] = {}
    for name, raw in reg.list_values("HKCU", BACKUP_KEY).items():
        try:
            data = json.loads(raw)
            if isinstance(data, dict) and "command" in data:
                out[name] = data
        except (json.JSONDecodeError, TypeError):
            continue
    return out


def enumerate_items() -> list[StartupItem]:
    """Enumera itens de inicialização (ativos + desativados pelo Nexus)."""
    items: list[StartupItem] = []
    try:
        for source, (hive, key_path) in RUN_SOURCES.items():
            for name, command in reg.list_values(hive, key_path).items():
                if not isinstance(command, str) or not command:
                    continue
                items.append(
                    StartupItem(
                        name=name, command=command, source=source, enabled=True,
                        exe_path=_exe_from_command(command),
                        impact=_impact_for(name, command),
                    )
                )
    except reg.UnsupportedPlatform:
        return items

    # Itens desativados por nós (estão no backup, com origem registrada).
    for name, data in _read_backups().items():
        if any(i.name == name and i.source == data.get("source") for i in items):
            continue
        cmd = data.get("command", "")
        items.append(
            StartupItem(
                name=name, command=cmd, source=data.get("source", "hkcu_run"),
                enabled=False, exe_path=_exe_from_command(cmd),
                impact=_impact_for(name, cmd),
            )
        )

    for source, folder in _startup_folders():
        if not folder.is_dir():
            continue
        backup = backup_dir()
        for lnk in list(folder.glob("*")):
            if lnk.suffix.lower() in (".lnk", ".exe", ".bat", ".cmd", ".vbs"):
                items.append(
                    StartupItem(
                        name=lnk.stem, command=str(lnk), source=source, enabled=True,
                        exe_path=str(lnk), impact=_impact_for(lnk.stem, str(lnk)),
                    )
                )
        if backup.is_dir():
            for lnk in list(backup.glob("*")):
                if lnk.suffix.lower() in (".lnk", ".exe", ".bat", ".cmd", ".vbs"):
                    items.append(
                        StartupItem(
                            name=lnk.stem, command=str(lnk), source=source,
                            enabled=False, exe_path=str(lnk),
                            impact=_impact_for(lnk.stem, str(lnk)),
                        )
                    )
    return items


def set_enabled(item: StartupItem, enabled: bool) -> tuple[bool, str]:
    """Ativa/desativa item de inicialização de forma reversível."""
    if not enabled and _is_protected(item.name, item.command):
        return False, (
            f"'{item.name}' faz parte da proteção do Windows e não deve ser "
            "desativado (proteção de segurança do Nexus Booster)."
        )
    try:
        if item.source in RUN_SOURCES:
            return _reg_toggle(item, enabled)
        return _folder_toggle(item, enabled)
    except reg.UnsupportedPlatform:
        return False, "Disponível somente no Windows."
    except Exception as exc:  # noqa: BLE001
        log.exception("falha ao alternar inicialização: %s", exc)
        return False, f"Falha: {exc}"


def _reg_toggle(item: StartupItem, enable: bool) -> tuple[bool, str]:
    hive, key_path = RUN_SOURCES[item.source]

    if enable:
        data = _read_backups().get(item.name)
        if not data:
            return False, "Item não foi desativado pelo Nexus Booster."
        command = data.get("command", "")
        if item.source == "hkcu_run":
            if not reg.write("HKCU", key_path, item.name, command):
                return False, "Não foi possível reativar (acesso negado)."
        else:
            from nexus.core.elevation import run_elevated_ps

            ps_path = "HKLM:\\" + key_path
            safe_name = item.name.replace("'", "''")
            safe_cmd = command.replace("'", "''")
            ok, out = run_elevated_ps(
                f"New-ItemProperty -Path '{ps_path}' -Name '{safe_name}'"
                f" -Value '{safe_cmd}' -PropertyType String -Force | Out-Null"
            )
            if not ok:
                return False, f"Falha (elevação): {out[:200]}"
        reg.delete_value("HKCU", BACKUP_KEY, item.name)
        log.info("inicialização reativada: %s (%s)", item.name, item.source)
        return True, f"'{item.name}' reativado."

    # Desativar: guarda backup com origem e remove do registro.
    value = reg.read(hive, key_path, item.name)
    if value is None:
        return False, "Item não encontrado."
    backup_data = json.dumps(
        {"command": value, "source": item.source}, ensure_ascii=False
    )
    if not reg.write("HKCU", BACKUP_KEY, item.name, backup_data):
        return False, "Não foi possível salvar o backup (acesso negado)."

    if item.source == "hkcu_run":
        if not reg.delete_value(hive, key_path, item.name):
            reg.delete_value("HKCU", BACKUP_KEY, item.name)
            return False, "Não foi possível remover (execute como administrador)."
    else:
        from nexus.core.elevation import run_elevated_ps

        ps_path = "HKLM:\\" + key_path
        safe_name = item.name.replace("'", "''")
        ok, out = run_elevated_ps(
            f"Remove-ItemProperty -Path '{ps_path}' -Name '{safe_name}'"
            " -ErrorAction Stop"
        )
        if not ok:
            reg.delete_value("HKCU", BACKUP_KEY, item.name)
            return False, f"Falha (elevação): {out[:200]}"
    log.info("inicialização desativada: %s (origem %s)", item.name, item.source)
    return True, f"'{item.name}' desativado. Pode ser reativado a qualquer momento."


def _folder_toggle(item: StartupItem, enable: bool) -> tuple[bool, str]:
    if enable:
        src = backup_dir() / Path(item.command).name
        target = None
        for source_id, folder in _startup_folders():
            if source_id == item.source and folder.is_dir():
                target = folder / src.name
                break
        if target is None:
            return False, "Pasta de inicialização não encontrada."
        try:
            shutil.move(str(src), str(target))
        except OSError as exc:
            return False, f"Falha ao mover: {exc}"
        log.info("inicialização reativada (pasta): %s", item.name)
        return True, f"'{item.name}' reativado."

    src = Path(item.command)
    if not src.exists():
        return False, "Arquivo não encontrado."
    try:
        shutil.move(str(src), str(backup_dir() / src.name))
    except OSError as exc:
        return False, f"Falha ao mover: {exc}"
    log.info("inicialização desativada (pasta): %s", item.name)
    return True, f"'{item.name}' desativado (guardado em {backup_dir()})."


def undo_disable(payload: dict) -> tuple[bool, str]:
    """Desfaz uma desativação feita pelo Nexus Booster (usado pelo histórico)."""
    item = StartupItem(
        name=payload.get("name", ""),
        command=payload.get("command", ""),
        source=payload.get("source", "hkcu_run"),
        enabled=False,
    )
    if not item.name:
        return False, "Registro de undo incompleto."
    return set_enabled(item, True)
