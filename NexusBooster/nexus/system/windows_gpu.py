"""Uso de GPU em GPUs Intel/AMD via contadores de desempenho do Windows.

Usa a classe WMI Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
(disponível no Windows 10 1709+ / Windows 11). Não depende de nomes de
contadores localizados. Se o contador não existir, o recurso é marcado como
não suportado — nenhuma métrica é inventada.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from nexus.system import powershell as ps
from nexus.system.snapshot import GpuSample

log = logging.getLogger("nexus.windows_gpu")

_supported: Optional[bool] = None
_gpu_name = ""

_ENGINE_QUERY = (
    "Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine"
    " -ErrorAction SilentlyContinue |"
    " Where-Object {$_.Name -like '*engtype_3D*'} |"
    " Measure-Object -Property UtilizationPercentage -Sum |"
    " Select-Object -Property Sum"
)


def set_gpu_name(name: str) -> None:
    global _gpu_name
    if name:
        _gpu_name = name


def _probe_supported() -> bool:
    global _supported
    if _supported is not None:
        return _supported
    if not ps.is_windows():
        _supported = False
        return False
    rows = ps.run_ps_json(_ENGINE_QUERY)
    _supported = rows is not None
    if _supported:
        log.info("Contadores de GPU do Windows disponíveis (uso de GPU suportado).")
    else:
        log.info("Contadores de GPU indisponíveis — uso de GPU não suportado nesta máquina.")
    return _supported


def sample() -> Optional[GpuSample]:
    """Soma a utilização dos motores 3D (limitada a 100%). None se não suportado."""
    if not _probe_supported():
        return None
    rows = ps.run_ps_json(_ENGINE_QUERY)
    if not rows:
        return GpuSample(name=_gpu_name or "GPU", utilization=0.0, source="contador-windows")
    total = 0.0
    for r in rows:
        if isinstance(r, dict):
            total += float(r.get("Sum") or 0)
    return GpuSample(
        name=_gpu_name or "GPU",
        utilization=min(total, 100.0),
        source="contador-windows",
    )
