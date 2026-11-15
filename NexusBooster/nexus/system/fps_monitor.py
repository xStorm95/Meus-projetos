"""Monitoramento de FPS real via PresentMon (Intel/GameTechDev).

O DK NÃO inventa métricas: o FPS só é exibido quando o usuário
configura o caminho do PresentMon.exe (download gratuito no GitHub oficial).
Sem o PresentMon, a interface mostra claramente "recurso não suportado".
"""

from __future__ import annotations

import csv
import logging
import os
import subprocess
import sys
import time
from collections import deque
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QObject, QTimer, Signal

from nexus.core.paths import temp_dir

log = logging.getLogger("nexus.fps")

MAX_FRAMES = 600


class FpsStats:
    def __init__(self) -> None:
        self.frametimes: deque[float] = deque(maxlen=MAX_FRAMES)
        self.total_frames = 0
        self.started_at = 0.0
        self.session_fps: deque[float] = deque(maxlen=MAX_FRAMES)

    def push(self, frametime_ms: float) -> None:
        if frametime_ms > 0:
            self.frametimes.append(frametime_ms)
            self.session_fps.append(1000.0 / frametime_ms)
            self.total_frames += 1

    def as_dict(self) -> dict:
        if not self.frametimes:
            return {
                "fps": 0.0, "avg": 0.0, "low1": 0.0, "frametime": 0.0,
                "frames": 0, "seconds": 0.0,
            }
        fps_sorted = sorted(self.session_fps)
        n = len(fps_sorted)
        avg = sum(self.session_fps) / n
        low1 = fps_sorted[max(0, int(n * 0.01) - 1)]
        current_ft = self.frametimes[-1]
        return {
            "fps": 1000.0 / current_ft if current_ft > 0 else 0.0,
            "avg": round(avg, 1),
            "low1": round(low1, 1),
            "frametime": round(current_ft, 2),
            "frametime_avg": round(sum(self.frametimes) / n, 2),
            "frames": self.total_frames,
            "seconds": round(time.time() - self.started_at, 1) if self.started_at else 0.0,
        }


def find_presentmon(custom_path: str = "") -> Optional[Path]:
    """Localiza o PresentMon.exe: caminho configurado ou junto ao app."""
    candidates = []
    if custom_path:
        candidates.append(Path(custom_path))
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).parent / "PresentMon.exe")
    for c in candidates:
        if c.is_file():
            return c
    return None


class FpsSession(QObject):
    """Sessão de captura PresentMon para um processo/pid específico."""

    updated = Signal(dict)      # estatísticas
    error = Signal(str)
    stopped = Signal(dict)      # estatísticas finais

    def __init__(self, presentmon_path: str, parent: Optional[QObject] = None):
        super().__init__(parent)
        self._pm = Path(presentmon_path) if presentmon_path else None
        self._proc: Optional[subprocess.Popen] = None
        self._csv_path: Optional[Path] = None
        self._timer = QTimer(self)
        self._timer.setInterval(500)
        self._timer.timeout.connect(self._poll)
        self._read_offset = 0
        self._columns: list[str] = []
        self.stats = FpsStats()
        self._last_error_logged = False

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self, pid: Optional[int] = None, process_name: str = "") -> bool:
        self.stop(silent=True)
        if not self._pm or not self._pm.is_file():
            self.error.emit(
                "PresentMon não configurado. Baixe o PresentMon oficial no GitHub "
                "(GameTechDev/PresentMon) e informe o caminho em Configurações."
            )
            return False

        self._csv_path = temp_dir() / f"fps_{int(time.time())}.csv"
        self._read_offset = 0
        self._columns = []
        self.stats = FpsStats()
        self.stats.started_at = time.time()

        args = [str(self._pm), "-no_gui", "-terminate_on_timed_out", "true"]
        if pid:
            args += ["-process_id", str(pid)]
        elif process_name:
            args += ["-process_name", process_name]
        args += ["-output_file", str(self._csv_path)]

        try:
            creation = 0x08000000 if sys.platform == "win32" else 0
            self._proc = subprocess.Popen(
                args,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                creationflags=creation,
            )
        except Exception as exc:  # noqa: BLE001
            self.error.emit(f"Falha ao iniciar o PresentMon: {exc}")
            self._proc = None
            return False

        # Verifica erro imediato de execução.
        QTimer.singleShot(1500, self._check_alive)
        self._timer.start()
        return True

    def _check_alive(self) -> None:
        if self._proc and self._proc.poll() is not None and self._timer.isActive():
            stderr = b""
            try:
                stderr = self._proc.stderr.read() or b""
            except Exception:
                pass
            msg = stderr.decode(errors="replace").strip()[:300]
            if msg:
                self.error.emit(f"PresentMon encerrou: {msg}")
            else:
                self.error.emit(
                    "O PresentMon encerrou inesperadamente. Em algumas versões ele "
                    "precisa ser executado como administrador."
                )
            self._timer.stop()

    def stop(self, silent: bool = False) -> None:
        final = self.stats.as_dict()
        self._timer.stop()
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None
        if self._csv_path:
            try:
                self._csv_path.unlink(missing_ok=True)
            except Exception:
                pass
            self._csv_path = None
        if not silent and final["frames"] > 0:
            self.stopped.emit(final)

    # ------------------------------------------------------------------
    def _poll(self) -> None:
        if not self._csv_path or not self._csv_path.exists():
            return
        try:
            size = self._csv_path.stat().st_size
            if size < self._read_offset:
                self._read_offset = 0  # arquivo novo/rotacionado
            with open(self._csv_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(self._read_offset)
                chunk = f.read()
                self._read_offset = f.tell()
        except OSError:
            return

        for line in chunk.splitlines():
            line = line.strip()
            if not line:
                continue
            fields = next(csv.reader([line]))
            if not fields:
                continue
            if not self._columns:
                low = [c.strip().lower() for c in fields]
                if "msbetweenpresents" in low or "deltatime" in low or "ftime" in low:
                    self._columns = low
                continue
            try:
                row = dict(zip(self._columns, fields))
                ft = None
                for key in ("msbetweenpresents", "deltatime", "ftime"):
                    if key in row and row[key]:
                        ft = float(row[key])
                        break
                if ft is not None:
                    self.stats.push(ft)
            except (ValueError, KeyError):
                continue

        d = self.stats.as_dict()
        if d["frames"] > 0:
            self.updated.emit(d)
