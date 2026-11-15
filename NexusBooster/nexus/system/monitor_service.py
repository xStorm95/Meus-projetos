"""Serviço de monitoramento em tempo real (thread dedicada, 1 Hz por padrão)."""

from __future__ import annotations

import logging
import time
from collections import deque
from typing import Optional

import psutil
from PySide6.QtCore import QObject, QThread, Signal

from nexus.system import gpu_nvidia, windows_gpu
from nexus.system.hardware import HardwareInfo, probe_hardware
from nexus.system.snapshot import DiskSample, GpuSample, SystemSnapshot

log = logging.getLogger("nexus.monitor")

HISTORY_POINTS = 120


class _MonitorThread(QThread):
    updated = Signal(object)
    hardware_ready = Signal(object)

    def __init__(self, interval_ms: int):
        super().__init__()
        self._interval = max(0.5, interval_ms / 1000.0)
        self._running = False
        self._last_disk_io: Optional[tuple[float, float, float]] = None
        self._last_net_io: Optional[tuple[float, float, float]] = None
        self._cpu_temp_unsupported = False
        self._last_hw_probe = 0.0
        self._gpu_name = ""
        # Aquece o cpu_percent (primeira chamada sempre retorna 0)
        psutil.cpu_percent(percpu=True)

    def set_interval(self, interval_ms: int) -> None:
        self._interval = max(0.5, interval_ms / 1000.0)

    def run(self) -> None:  # pragma: no cover — loop em thread
        self._running = True
        # Detecção de hardware pesada acontece primeiro.
        try:
            hw = probe_hardware()
            self._gpu_name = hw.gpu_names[0] if hw.gpu_names else ""
            windows_gpu.set_gpu_name(self._gpu_name)
            gpu_nvidia.name()  # pré-inicializa NVML
        except Exception as exc:  # noqa: BLE001
            log.exception("probe de hardware falhou: %s", exc)
            hw = HardwareInfo(ready=True)
        self.hardware_ready.emit(hw)

        while self._running:
            try:
                snap = self._collect()
                self.updated.emit(snap)
            except Exception as exc:  # noqa: BLE001
                log.exception("ciclo de monitoramento falhou: %s", exc)
            time.sleep(self._interval)

    def stop(self) -> None:
        self._running = False

    # ------------------------------------------------------------------
    def _collect(self) -> SystemSnapshot:
        snap = SystemSnapshot(ts=time.time())
        unsupported: list[str] = []

        # CPU
        per_core = psutil.cpu_percent(percpu=True)
        snap.cpu_per_core = per_core
        snap.cpu_percent = (
            sum(per_core) / len(per_core) if per_core else psutil.cpu_percent()
        )
        try:
            freq = psutil.cpu_freq()
            snap.cpu_freq_mhz = freq.current if freq else None
            snap.cpu_freq_max_mhz = freq.max if freq else None
        except Exception:
            pass

        # RAM / swap
        vm = psutil.virtual_memory()
        snap.ram_total_gb = vm.total / 1024**3
        snap.ram_used_gb = (vm.total - vm.available) / 1024**3
        snap.ram_percent = vm.percent
        try:
            sw = psutil.swap_memory()
            snap.swap_total_gb = sw.total / 1024**3
            snap.swap_used_gb = sw.used / 1024**3
        except Exception:
            pass

        # Discos (partições)
        for part in psutil.disk_partitions(all=False):
            if "cdrom" in part.opts or not part.fstype:
                continue
            try:
                du = psutil.disk_usage(part.mountpoint)
                snap.disks.append(
                    DiskSample(
                        path=part.mountpoint,
                        total_gb=du.total / 1024**3,
                        used_gb=du.used / 1024**3,
                        free_gb=du.free / 1024**3,
                        percent=du.percent,
                    )
                )
            except (PermissionError, OSError):
                continue

        # Taxas de E/S (delta)
        snap.disk_read_mbs, snap.disk_write_mbs = self._rate(
            "disk", psutil.disk_io_counters()
        )
        net = psutil.net_io_counters()
        snap.net_down_mbs, snap.net_up_mbs = self._rate("net", net)

        # Temperaturas
        snap.cpu_temp = self._cpu_temp(unsupported)
        snap.gpu_temp = None

        # GPU — NVIDIA primeiro, depois contadores do Windows (Intel/AMD).
        gpu: Optional[GpuSample] = gpu_nvidia.sample()
        if gpu is None:
            gpu = windows_gpu.sample()
        if gpu is not None:
            snap.gpu = gpu
            snap.gpu_temp = gpu.temperature
        else:
            snap.gpu = None
            if self._gpu_name:
                snap.gpu = GpuSample(name=self._gpu_name, source="não suportado")
                unsupported.append("Uso de GPU não suportado nesta máquina (sem NVML/contadores).")

        snap.proc_count = len(psutil.pids())
        try:
            snap.uptime_hours = (time.time() - psutil.boot_time()) / 3600.0
        except Exception:
            pass

        snap.unsupported = unsupported
        return snap

    def _rate(self, kind: str, counters) -> tuple[float, float]:
        if counters is None:
            return 0.0, 0.0
        now = time.time()
        if kind == "disk":
            cur = (counters.read_bytes, counters.write_bytes)
        else:
            cur = (counters.bytes_recv, counters.bytes_sent)
        attr = f"_last_{kind}_io"
        last = getattr(self, attr)
        setattr(self, attr, (cur[0], cur[1], now))
        if last is None or now <= last[2]:
            return 0.0, 0.0
        dt = now - last[2]
        return (
            max(0.0, (cur[0] - last[0]) / dt / 1024**2),
            max(0.0, (cur[1] - last[1]) / dt / 1024**2),
        )

    def _cpu_temp(self, unsupported: list[str]) -> Optional[float]:
        # 1) psutil (Linux e alguns hardwares)
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for key in ("coretemp", "k10temp", "cpu_thermal", "zenpower", "acpitz"):
                    if key in temps:
                        return temps[key][0].current
        except (AttributeError, Exception):
            pass

        # 2) WMI (Windows) — tenta poucas vezes e desiste com honestidade.
        if self._cpu_temp_unsupported:
            return None
        if time.time() - self._last_hw_probe < 5:
            return None
        self._last_hw_probe = time.time()
        from nexus.system import powershell as ps

        rows = ps.run_ps_json(
            "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature"
            " -ErrorAction SilentlyContinue | Select-Object -First 1 -Property CurrentTemperature"
        )
        if rows:
            try:
                raw = rows[0].get("CurrentTemperature")
                if raw and raw > 0:
                    return round(raw / 10.0 - 273.15, 1)  # décimos de Kelvin
            except Exception:
                pass
        self._cpu_temp_unsupported = True
        unsupported.append("Temperatura da CPU não suportada (WMI ACPI indisponível).")
        return None


class MonitorService(QObject):
    """API usada pela interface: start/stop, sinais e histórico p/ gráficos."""

    updated = Signal(object)
    hardware_ready = Signal(object)

    def __init__(self, interval_ms: int = 1000):
        super().__init__()
        self._thread = _MonitorThread(interval_ms)
        self._thread.updated.connect(self._on_update)
        self._thread.hardware_ready.connect(self._on_hw)
        self.latest: Optional[SystemSnapshot] = None
        self.hardware: HardwareInfo = HardwareInfo()
        self.history = {
            "cpu": deque(maxlen=HISTORY_POINTS),
            "ram": deque(maxlen=HISTORY_POINTS),
            "gpu": deque(maxlen=HISTORY_POINTS),
            "disk_read": deque(maxlen=HISTORY_POINTS),
            "disk_write": deque(maxlen=HISTORY_POINTS),
            "net_down": deque(maxlen=HISTORY_POINTS),
            "net_up": deque(maxlen=HISTORY_POINTS),
            "cpu_freq": deque(maxlen=HISTORY_POINTS),
            "cpu_temp": deque(maxlen=HISTORY_POINTS),
            "gpu_temp": deque(maxlen=HISTORY_POINTS),
        }

    def start(self) -> None:
        if not self._thread.isRunning():
            self._thread.start()

    def stop(self) -> None:
        self._thread.stop()
        self._thread.wait(3000)

    def set_interval(self, interval_ms: int) -> None:
        self._thread.set_interval(interval_ms)

    def _on_update(self, snap: SystemSnapshot) -> None:
        self.latest = snap
        h = self.history
        h["cpu"].append(snap.cpu_percent)
        h["ram"].append(snap.ram_percent)
        if snap.gpu and snap.gpu.utilization is not None:
            h["gpu"].append(snap.gpu.utilization)
        else:
            h["gpu"].append(None)
        h["disk_read"].append(snap.disk_read_mbs)
        h["disk_write"].append(snap.disk_write_mbs)
        h["net_down"].append(snap.net_down_mbs)
        h["net_up"].append(snap.net_up_mbs)
        h["cpu_freq"].append(snap.cpu_freq_mhz)
        h["cpu_temp"].append(snap.cpu_temp)
        h["gpu_temp"].append(snap.gpu_temp)
        self.updated.emit(snap)

    def _on_hw(self, hw: HardwareInfo) -> None:
        self.hardware = hw
        self.hardware_ready.emit(hw)
