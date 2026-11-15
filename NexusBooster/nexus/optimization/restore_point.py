"""Criação de ponto de restauração do Windows (quando disponível)."""

from __future__ import annotations

import logging

log = logging.getLogger("nexus.restorepoint")


def protection_enabled() -> bool | None:
    """Verifica se a Proteção do Sistema está ativa. None = não suportado."""
    from nexus.system import powershell as ps

    if not ps.is_windows():
        return None
    rows = ps.run_ps_json(
        "Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Select-Object -First 1"
        " -Property SequenceNumber"
    )
    if rows:
        return True
    # Verifica se o recurso está habilitado no drive do sistema
    ok, out = ps.run_ps(
        "$d = $env:SystemDrive; (Get-CimInstance -ClassName SystemRestore"
        " -Namespace root/default -ErrorAction SilentlyContinue)"
        " | Select-Object -ExpandProperty Drive"
    )
    if ok and out and any(ch.isalpha() for ch in out):
        return True
    return False


def create(description: str = "DK") -> tuple[bool, str]:
    """Cria ponto de restauração (elevação UAC). Honestidade total no resultado."""
    from nexus.core.elevation import run_elevated_ps

    ok, out = run_elevated_ps(
        "\n".join(
            [
                "Enable-ComputerRestore -Drive \"$env:SystemDrive\\\" -ErrorAction SilentlyContinue",
                "$freq = Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"
                "\\SystemRestore' -Name 'SystemRestorePointCreationFrequency' -ErrorAction SilentlyContinue",
                "if (-not $freq) { New-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT"
                "\\CurrentVersion\\SystemRestore' -Name 'SystemRestorePointCreationFrequency'"
                " -Value 0 -PropertyType DWord -Force | Out-Null }",
                f"Checkpoint-Computer -Description '{description}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop",
                "$out += 'Ponto de restauração criado com sucesso.'",
            ]
        ),
        timeout=240,
    )
    if ok and "sucesso" in out:
        return True, "Ponto de restauração criado com sucesso."
    if "recusou" in out:
        return False, "Elevação (UAC) recusada pelo usuário."
    return False, (
        f"Não foi possível criar o ponto de restauração: {out[:200] or 'motivo desconhecido'}. "
        "O Windows limita a criação a um ponto a cada 24h por padrão — os ajustes ainda são "
        "reversíveis pelo botão 'Desfazer' do DK."
    )
