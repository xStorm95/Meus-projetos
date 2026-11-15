"""Estruturas de dados do monitoramento em tempo real."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DiskSample:
    path: str
    total_gb: float
    used_gb: float
    free_gb: float
    percent: float


@dataclass
class GpuSample:
    name: str
    utilization: Optional[float] = None      # %
    mem_used_mb: Optional[float] = None
    mem_total_mb: Optional[float] = None
    temperature: Optional[float] = None      # °C
    fan_percent: Optional[float] = None
    driver: str = ""
    source: str = ""                         # nvidia-ml | contador-windows


@dataclass
class SystemSnapshot:
    ts: float
    cpu_percent: float = 0.0
    cpu_per_core: list[float] = field(default_factory=list)
    cpu_freq_mhz: Optional[float] = None
    cpu_freq_max_mhz: Optional[float] = None
    ram_used_gb: float = 0.0
    ram_total_gb: float = 0.0
    ram_percent: float = 0.0
    swap_used_gb: float = 0.0
    swap_total_gb: float = 0.0
    disks: list[DiskSample] = field(default_factory=list)
    disk_read_mbs: float = 0.0
    disk_write_mbs: float = 0.0
    net_down_mbs: float = 0.0
    net_up_mbs: float = 0.0
    cpu_temp: Optional[float] = None
    gpu_temp: Optional[float] = None
    gpu: Optional[GpuSample] = None
    proc_count: int = 0
    uptime_hours: float = 0.0
    # Observações honestas: lista de recursos não suportados nesta máquina.
    unsupported: list[str] = field(default_factory=list)
