"""Detecção de administrador e execução elevada (UAC) de scripts PowerShell."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from pathlib import Path

from nexus.core.paths import temp_dir


def is_windows() -> bool:
    return sys.platform == "win32"


def is_admin() -> bool:
    """True se o processo já roda com privilégios de administrador."""
    if not is_windows():
        return False
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _ps_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def run_elevated_ps(script: str, timeout: int = 180) -> tuple[bool, str]:
    """Executa um bloco PowerShell elevado (UAC) e captura a saída.

    Retorna (sucesso, saída). Em ambiente não-Windows retorna (False, motivo).
    """
    if not is_windows():
        return False, "Operação disponível somente no Windows."

    out_file = temp_dir() / f"elev_{int(time.time() * 1000)}.txt"
    script_dir = temp_dir()
    ps_script = "\n".join(
        [
            "$ErrorActionPreference = 'Continue'",
            "$out = @()",
            "try {",
            script,
            "} catch {",
            "  $out += ('ERRO: ' + $_.Exception.Message)",
            "}",
            "$out += '__NEXUS_DONE__'",
            "Set-Content -Path " + _ps_quote(str(out_file)) + " -Value ($out -join \"`n\")",
        ]
    )
    script_file = script_dir / f"elev_{int(time.time() * 1000)}.ps1"
    script_file.write_text(ps_script, encoding="utf-8-sig")

    try:
        # ShellExecuteW com "runas" dispara o UAC e espera a conclusão.
        import ctypes

        params = (
            f'-NoProfile -ExecutionPolicy Bypass -File "{script_file}"'
        )
        ret = ctypes.windll.shell32.ShellExecuteW(
            None, "runas", "powershell.exe", params, None, 0  # SW_HIDE
        )
        if ret <= 32:
            return False, "O usuário recusou a elevação (UAC) ou a operação falhou."

        # Aguarda o arquivo de saída ser criado.
        deadline = time.time() + timeout
        while time.time() < deadline:
            if out_file.exists():
                time.sleep(0.3)
                text = out_file.read_text(encoding="utf-8", errors="replace")
                if "__NEXUS_DONE__" in text:
                    body = text.replace("__NEXUS_DONE__", "").strip()
                    ok = "ERRO:" not in body
                    return ok, body
            time.sleep(0.4)
        return False, "Tempo esgotado aguardando a operação elevada."
    finally:
        for f in (script_file, out_file):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass


def relaunch_as_admin() -> bool:
    """Relança o próprio aplicativo com privilégios de administrador."""
    if not is_windows():
        return False
    try:
        import ctypes

        exe = sys.executable if getattr(sys, "frozen", False) else sys.executable
        params = f'"{Path(sys.argv[0]).resolve()}"' if not getattr(sys, "frozen", False) else ""
        ret = ctypes.windll.shell32.ShellExecuteW(
            None, "runas", exe, params, None, 1  # SW_SHOWNORMAL
        )
        return ret > 32
    except Exception:
        return False
