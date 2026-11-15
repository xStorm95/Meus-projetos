"""Contêiner de serviços compartilhados (injetado em toda a interface)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from nexus.core.database import Database
from nexus.core.settings import Settings
from nexus.games.booster import BoostSession
from nexus.optimization.engine import OptimizationEngine
from nexus.system.fps_monitor import FpsSession
from nexus.system.monitor_service import MonitorService


@dataclass
class Services:
    db: Database
    settings: Settings
    monitor: MonitorService
    engine: OptimizationEngine
    booster: BoostSession
    fps: Optional[FpsSession] = None
    toast_host: Optional[object] = None

    def start(self) -> None:
        self.monitor.start()

    def shutdown(self) -> None:
        if self.booster.state.active:
            self.booster.stop(reason="aplicativo encerrado")
        self.monitor.stop()
        from nexus.core import worker

        worker.wait_for_all(timeout=3.0)
        self.db.close()
