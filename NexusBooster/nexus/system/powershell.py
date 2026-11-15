"""Helper para invocar PowerShell e interpretar saída JSON."""

from __future__ import annotations

import json
import logging
import subprocess
import sys
from typing import Any, Optional

log = logging.getLogger("nexus.powershell")


def is_windows() -> bool:
    return sys.platform == "win32"


def run_cmd(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    """Executa um comando oculto e retorna (sucesso, stdout+stderr)."""
    creation = 0x08000000 if is_windows() else 0  # CREATE_NO_WINDOW
    try:
        p = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
            creationflags=creation,
        )
        out = (p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")
        return p.returncode == 0, out.strip()
    except FileNotFoundError:
        return False, "Comando não encontrado."
    except subprocess.TimeoutExpired:
        return False, "Tempo esgotado."
    except Exception as exc:  # noqa: BLE001
        log.debug("run_cmd falhou (%s): %s", args, exc)
        return False, f"{type(exc).__name__}: {exc}"


def run_ps(command: str, timeout: int = 30) -> tuple[bool, str]:
    """Executa um bloco PowerShell no contexto atual (sem elevação)."""
    if not is_windows():
        return False, "PowerShell disponível somente no Windows."
    return run_cmd(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        timeout=timeout,
    )


def run_ps_json(command: str, timeout: int = 30) -> Optional[Any]:
    """Executa PowerShell esperando saída JSON (ConvertTo-Json). None se falhar."""
    ok, out = run_ps(
        f"try {{ {command} | ConvertTo-Json -Compress -Depth 4 }} catch {{ 'null' }}",
        timeout=timeout,
    )
    if not ok or not out or out.strip() in ("null", ""):
        return None
    try:
        data = json.loads(out)
        # PowerShell devolve um objeto simples quando há 1 resultado.
        if isinstance(data, list):
            return data
        return [data] if data else []
    except json.JSONDecodeError:
        return None
