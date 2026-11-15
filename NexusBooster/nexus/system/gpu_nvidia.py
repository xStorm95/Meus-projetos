"""Monitoramento de GPUs NVIDIA via NVML (opcional, degrada sem driver)."""

from __future__ import annotations

import logging
from typing import Optional

from nexus.system.snapshot import GpuSample

log = logging.getLogger("nexus.gpu_nvidia")

_nvml = None
_init_tried = False
_device = None


def _try_init():
    global _nvml, _init_tried, _device
    if _init_tried:
        return _nvml is not None
    _init_tried = True
    try:
        import pynvml  # noqa: PLC0415

        pynvml.nvmlInit()
        _nvml = pynvml
        _device = pynvml.nvmlDeviceGetHandleByIndex(0)
        log.info("NVML inicializado — monitoramento NVIDIA disponível.")
    except Exception as exc:  # noqa: BLE001
        log.info("NVML indisponível: %s", exc)
        _nvml = None
    return _nvml is not None


def name() -> str:
    if _try_init() and _device is not None:
        try:
            return _nvml.nvmlDeviceGetName(_device)
        except Exception:
            pass
    return ""


def sample() -> Optional[GpuSample]:
    """Amostra atual da GPU NVIDIA ou None se não suportado."""
    if not _try_init() or _device is None:
        return None
    try:
        util = _nvml.nvmlDeviceGetUtilizationRates(_device)
        mem = _nvml.nvmlDeviceGetMemoryInfo(_device)
        s = GpuSample(
            name=_nvml.nvmlDeviceGetName(_device),
            utilization=float(util.gpu),
            mem_used_mb=mem.used / 1024**2,
            mem_total_mb=mem.total / 1024**2,
            source="nvidia-ml",
        )
        try:
            s.temperature = float(_nvml.nvmlDeviceGetTemperature(_device, _nvml.NVML_TEMPERATURE_GPU))
        except Exception:
            pass
        try:
            s.fan_percent = float(_nvml.nvmlDeviceGetFanSpeed(_device))
        except Exception:
            pass
        return s
    except Exception as exc:  # noqa: BLE001
        log.debug("amostra NVML falhou: %s", exc)
        return None
