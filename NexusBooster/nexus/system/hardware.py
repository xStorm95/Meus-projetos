"""Identificação de hardware: CPU, GPU, RAM, discos, placa-mãe e SO.

Estratégia (Windows): Registro -> WMI via PowerShell (JSON) -> psutil.
Em outros sistemas: /proc, psutil e platform (para desenvolvimento).
"""

from __future__ import annotations

import logging
import platform as pyplatform
from dataclasses import dataclass, field
from typing import Optional

from nexus.system import powershell as ps

log = logging.getLogger("nexus.hardware")

_CACHE: dict[str, object] = {}


@dataclass
class RamStick:
    size_gb: float
    speed_mhz: Optional[int] = None
    manufacturer: str = ""
    slot: str = ""


@dataclass
class DiskInfo:
    model: str
    size_gb: float
    interface: str = ""


@dataclass
class HardwareInfo:
    cpu_name: str = ""
    cpu_cores_physical: int = 0
    cpu_cores_logical: int = 0
    cpu_max_freq_mhz: Optional[float] = None
    gpu_names: list[str] = field(default_factory=list)
    gpu_driver: str = ""
    ram_total_gb: float = 0.0
    ram_sticks: list[RamStick] = field(default_factory=list)
    disks: list[DiskInfo] = field(default_factory=list)
    motherboard: str = ""
    os_name: str = ""
    os_build: str = ""
    hostname: str = ""
    ready: bool = False


def _windows_cpu_name() -> str:
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
        ) as key:
            name, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            return str(name)
    except Exception:
        return ""


def _linux_cpu_name() -> str:
    try:
        for line in open("/proc/cpuinfo", encoding="utf-8", errors="replace"):
            if line.startswith("model name"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return pyplatform.processor() or "Processador desconhecido"


def cpu_info() -> tuple[str, int, int, Optional[float]]:
    """(nome, núcleos físicos, núcleos lógicos, freq máxima MHz)."""
    import psutil

    name = _windows_cpu_name() if ps.is_windows() else _linux_cpu_name()
    if not name:
        name = pyplatform.processor() or "Processador desconhecido"
    phys = psutil.cpu_count(logical=False) or 1
    logical = psutil.cpu_count(logical=True) or phys
    freq = None
    try:
        f = psutil.cpu_freq()
        freq = f.max if f and f.max else None
    except Exception:
        pass
    return name, phys, logical, freq


def gpu_info() -> list[dict]:
    if "gpu" in _CACHE:
        return _CACHE["gpu"]  # type: ignore[return-value]
    data: list[dict] = []
    if ps.is_windows():
        rows = ps.run_ps_json(
            "Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,"
            "AdapterRAM | ConvertTo-Json -Compress"
        )
        if rows:
            items = rows if isinstance(rows, list) else [rows]
            for r in items:
                if isinstance(r, dict) and r.get("Name"):
                    data.append(
                        {
                            "name": str(r.get("Name", "")),
                            "driver": str(r.get("DriverVersion", "")),
                            "vram_bytes": int(r.get("AdapterRAM") or 0),
                        }
                    )
    else:
        try:
            import subprocess

            out = subprocess.run(
                ["lspci"], capture_output=True, text=True, timeout=5
            ).stdout
            for line in out.splitlines():
                if "VGA compatible controller" in line or "3D controller" in line:
                    data.append({"name": line.split(":", 2)[-1].strip(), "driver": "", "vram_bytes": 0})
        except Exception:
            pass
    _CACHE["gpu"] = data
    return data


def ram_info() -> tuple[float, list[RamStick]]:
    import psutil

    total = round(psutil.virtual_memory().total / 1024**3, 1)
    sticks: list[RamStick] = []
    if ps.is_windows():
        rows = ps.run_ps_json(
            "Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,"
            "Manufacturer,DeviceLocator | ConvertTo-Json -Compress"
        )
        if rows:
            items = rows if isinstance(rows, list) else [rows]
            for r in items:
                if isinstance(r, dict):
                    sticks.append(
                        RamStick(
                            size_gb=round(int(r.get("Capacity") or 0) / 1024**3, 1),
                            speed_mhz=int(r.get("Speed") or 0) or None,
                            manufacturer=str(r.get("Manufacturer") or "").strip(),
                            slot=str(r.get("DeviceLocator") or "").strip(),
                        )
                    )
    return total, sticks


def disks_info() -> list[DiskInfo]:
    out: list[DiskInfo] = []
    if ps.is_windows():
        rows = ps.run_ps_json(
            "Get-CimInstance Win32_DiskDrive | Select-Object Model,Size,InterfaceType"
            " | ConvertTo-Json -Compress"
        )
        if rows:
            items = rows if isinstance(rows, list) else [rows]
            for r in items:
                if isinstance(r, dict) and r.get("Model"):
                    out.append(
                        DiskInfo(
                            model=str(r.get("Model", "")),
                            size_gb=round(int(r.get("Size") or 0) / 1024**3, 1),
                            interface=str(r.get("InterfaceType") or ""),
                        )
                    )
    else:
        try:
            import subprocess

            res = subprocess.run(
                ["lsblk", "-d", "-n", "-o", "NAME,SIZE,TYPE"],
                capture_output=True, text=True, timeout=5,
            )
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 3 and parts[2] == "disk":
                    out.append(DiskInfo(model=f"/dev/{parts[0]}", size_gb=0.0, interface=""))
        except Exception:
            pass
    return out


def motherboard_info() -> str:
    if ps.is_windows():
        rows = ps.run_ps_json(
            "Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product"
            " | ConvertTo-Json -Compress"
        )
        if rows:
            r = rows[0] if isinstance(rows, list) else rows
            if isinstance(r, dict):
                mfr = str(r.get("Manufacturer") or "").strip()
                prod = str(r.get("Product") or "").strip()
                return f"{mfr} {prod}".strip()
    return ""


def os_info() -> tuple[str, str]:
    if ps.is_windows():
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion"
            ) as key:
                product = winreg.QueryValueEx(key, "ProductName")[0]
                try:
                    display = winreg.QueryValueEx(key, "DisplayVersion")[0]
                except OSError:
                    display = winreg.QueryValueEx(key, "ReleaseId")[0]
                return str(product), str(display)
        except Exception:
            pass
    return f"{pyplatform.system()} {pyplatform.release()}", pyplatform.version()


def probe_hardware() -> HardwareInfo:
    """Coleta completa (pode levar alguns segundos — chamar em thread)."""
    info = HardwareInfo()
    try:
        info.hostname = pyplatform.node()
        name, phys, logical, freq = cpu_info()
        info.cpu_name = name
        info.cpu_cores_physical = phys
        info.cpu_cores_logical = logical
        info.cpu_max_freq_mhz = freq
        gpus = gpu_info()
        info.gpu_names = [g["name"] for g in gpus]
        info.gpu_driver = gpus[0].get("driver", "") if gpus else ""
        info.ram_total_gb, info.ram_sticks = ram_info()
        info.disks = disks_info()
        info.motherboard = motherboard_info()
        info.os_name, info.os_build = os_info()
        info.ready = True
    except Exception as exc:  # noqa: BLE001
        log.exception("Falha ao detectar hardware: %s", exc)
        info.ready = True  # ainda exibe o que conseguiu
    return info
