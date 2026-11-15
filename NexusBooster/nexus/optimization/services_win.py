"""Gerenciamento de serviços do Windows com catálogo de segurança.

O DK NUNCA permite parar/desativar serviços de segurança
(Windows Defender, Firewall, Windows Update e serviços essenciais) — veja
nexus.core.safety.PROTECTED_SERVICES.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import psutil

from nexus.core import safety

log = logging.getLogger("nexus.services")

STARTUP_LABELS = {
    "automatic": "Automático",
    "manual": "Manual",
    "disabled": "Desativado",
    "delayed": "Automático (atrasado)",
}


@dataclass
class WinServiceInfo:
    name: str
    display_name: str
    status: str          # running | stopped | ...
    start_type: str      # automatic | manual | disabled
    description: str = ""
    safe_to_disable: bool = False
    reason: str = ""     # por que é (ou não) seguro ajustar

    @property
    def status_label(self) -> str:
        return {"running": "Em execução", "stopped": "Parado"}.get(self.status, self.status)

    @property
    def start_label(self) -> str:
        return STARTUP_LABELS.get(self.start_type, self.start_type)


# Catálogo de serviços que PODEM ser ajustados com segurança, com explicação.
# Tudo fora do catálogo é tratado como "não recomendado".
SAFE_CATALOG: dict[str, tuple[bool, str]] = {
    "sysmain": (True, "Pré-busca/Superfetch: pode ser ajustada em PCs com SSD; não afeta segurança."),
    "diagtrack": (True, "Telemetria de diagnóstico da Microsoft: seguro desativar."),
    "dmwappushservice": (True, "Roteamento de mensagens WAP: seguro desativar se não usa MDM."),
    "mapsbroker": (True, "Gerenciador de mapas offline: seguro desativar."),
    "fax": (True, "Serviço de fax: seguro desativar na maioria dos PCs."),
    "retaildemo": (True, "Modo de demonstração de loja: seguro desativar em PCs domésticos."),
    "lfsvc": (True, "Geolocalização: seguro desativar se nenhum app usa localização."),
    "walletservice": (True, "Carteira da Microsoft: seguro desativar."),
    "wpcmonsvc": (True, "Controle parental: seguro desativar se não usa família."),
    "remoteregistry": (True, "Registro remoto: seguro desativar (não usado em casa)."),
    "sharedaccess": (True, "Compartilhamento de internet (ICS): seguro se não compartilha rede."),
    "trkwks": (True, "Rastreamento de link distribuído: seguro desativar."),
    "wisvc": (True, "Insights do Windows: seguro desativar."),
    "wermsvc": (True, "Relatórios de erros: seguro desativar."),
    "phonesvc": (True, "Gerenciamento de telefone: seguro desativar se não usa 'Continuar no celular'."),
    "wercplsupport": (True, "Suporte a relatórios de erros (painel): seguro desativar."),
    "downloadedmapsmanager": (True, "Mapas baixados: seguro desativar."),
    "xblauthmanager": (False, "Xbox Live: necessário para jogos da Microsoft Store / Xbox Game Pass."),
    "xblgamesave": (False, "Saves na nuvem do Xbox: necessário para jogos da Microsoft."),
    "bthserv": (False, "Bluetooth: necessário se você usa fones/mouses Bluetooth."),
    "spooler": (False, "Spooler de impressão: necessário para imprimir."),
    "wsearch": (False, "Pesquisa do Windows: pode desativar, mas a busca de arquivos para de funcionar."),
    "themes": (False, "Serviço de temas: manter ativado (interface do Windows)."),
    "audiosrv": (False, "Áudio do Windows: essencial."),
}


def _is_windows() -> bool:
    import sys

    return sys.platform == "win32"


def enumerate_services() -> Optional[list[WinServiceInfo]]:
    """Lista serviços do Windows. None se não estiver no Windows."""
    if not _is_windows():
        return None
    out: list[WinServiceInfo] = []
    for svc in psutil.win_service_iter():
        try:
            info = svc.as_dict()
        except Exception:
            continue
        name = (info.get("name") or "").lower()
        desc = (info.get("description") or "").strip()
        start_type = (info.get("start_type") or "").lower()
        status = "running" if info.get("status") == "running" else "stopped"
        protected = safety.is_protected_service(name)
        safe, reason = SAFE_CATALOG.get(name, (False, "Fora do catálogo de segurança — ajuste não recomendado."))
        if protected:
            safe, reason = False, "Serviço essencial/de segurança — bloqueado pelo DK."
        out.append(
            WinServiceInfo(
                name=name,
                display_name=info.get("display_name") or name,
                status=status,
                start_type=start_type,
                description=desc[:500],
                safe_to_disable=bool(safe and not protected),
                reason=reason,
            )
        )
    return sorted(out, key=lambda s: (not s.safe_to_disable, s.name))


def stop_service(name: str) -> tuple[bool, str]:
    if safety.is_protected_service(name):
        return False, f"'{name}' é um serviço essencial/de segurança — bloqueado."
    if not _is_windows():
        return False, "Disponível somente no Windows."
    try:
        svc = psutil.win_service_get(name)
        if svc.status() != "running":
            return True, f"'{name}' já está parado."
        svc.stop()
        return True, f"'{name}' parado (o tipo de inicialização não mudou)."
    except psutil.NoSuchProcess:
        return False, "Serviço não encontrado."
    except Exception as exc:  # noqa: BLE001
        return False, f"Falha ao parar (execute como administrador): {exc}"


def start_service(name: str) -> tuple[bool, str]:
    if not _is_windows():
        return False, "Disponível somente no Windows."
    try:
        svc = psutil.win_service_get(name)
        svc.start()
        return True, f"'{name}' iniciado."
    except Exception as exc:  # noqa: BLE001
        return False, f"Falha ao iniciar (execute como administrador): {exc}"


def set_start_type(name: str, start_type: str) -> tuple[bool, str, dict]:
    """Altera o tipo de inicialização (elevação UAC). Retorna payload de undo."""
    if safety.is_protected_service(name):
        return False, f"'{name}' é um serviço essencial/de segurança — bloqueado.", {}
    if start_type not in ("auto", "demand", "disabled"):
        return False, "Tipo inválido.", {}
    from nexus.core.elevation import run_elevated_ps

    current = _current_start_type(name)
    if current is None:
        return False, "Serviço não encontrado.", {}
    ok, out = run_elevated_ps(
        f"Set-Service -Name '{name}' -StartupType "
        f"{ {'auto': 'Automatic', 'demand': 'Manual', 'disabled': 'Disabled'}[start_type] }"
        " -ErrorAction Stop"
    )
    if not ok:
        return False, f"Falha: {out[:200]}", {}
    undo = {"service": name, "previous_start_type": current}
    return True, f"'{name}' alterado para { {'auto': 'Automático', 'demand': 'Manual', 'disabled': 'Desativado'}[start_type] }.", undo


def _current_start_type(name: str) -> Optional[str]:
    try:
        svc = psutil.win_service_get(name)
        d = svc.as_dict()
        return (d.get("start_type") or "").lower()
    except Exception:
        return None


def restore(undo: dict) -> tuple[bool, str]:
    """Restaura tipo de inicialização anterior (usado pelo histórico)."""
    name = undo.get("service", "")
    prev = undo.get("previous_start_type", "manual")
    mapping = {"automatic": "auto", "manual": "demand", "disabled": "disabled", "delayed": "auto"}
    stype = mapping.get(prev, "demand")
    ok, msg, _ = set_start_type(name, stype)
    return ok, msg
