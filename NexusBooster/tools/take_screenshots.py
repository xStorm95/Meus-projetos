#!/usr/bin/env python3
"""Captura screenshots da interface em modo offscreen (para documentação).

Uso:  QT_QPA_PLATFORM=offscreen python tools/take_screenshots.py [pasta]
"""

from __future__ import annotations

import os
import sys

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from nexus.core.database import Database  # noqa: E402
from nexus.core.paths import temp_dir  # noqa: E402
from nexus.core.settings import Settings  # noqa: E402
from nexus.games.booster import BoostSession  # noqa: E402
from nexus.optimization.engine import OptimizationEngine  # noqa: E402
from nexus.system.monitor_service import MonitorService  # noqa: E402


def main() -> int:
    from PySide6.QtCore import QEventLoop, QTimer
    from PySide6.QtWidgets import QApplication

    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "docs", "screenshots"
    )
    os.makedirs(out_dir, exist_ok=True)

    app = QApplication(sys.argv)

    db_path = temp_dir() / "shots.db"
    if db_path.exists():
        db_path.unlink()
    db = Database(db_path)
    settings = Settings(db)
    monitor = MonitorService(700)
    engine = OptimizationEngine(db)
    booster = BoostSession(db, settings)

    class _Services:
        def start(self):
            monitor.start()

        def shutdown(self):
            monitor.stop()
            db.close()

    services = _Services()
    services.db = db
    services.settings = settings
    services.monitor = monitor
    services.engine = engine
    services.booster = booster
    services.fps = None
    services.toast_host = None

    from nexus.ui.theme import apply_theme

    apply_theme(app, "neon")

    from nexus.ui.main_window import MainWindow

    win = MainWindow(services)
    win.resize(1440, 900)
    win.show()
    monitor.start()

    def wait(ms: int) -> None:
        loop = QEventLoop()
        QTimer.singleShot(ms, loop.quit)
        loop.exec()

    wait(4000)  # deixa o monitor preencher gráficos/gauges

    shots = {
        "dashboard": "dashboard",
        "game-booster": "booster",
        "hardware-monitor": "hardware",
        "limpeza-avancada": "cleanup",
        "internet-boost": "internet",
        "biblioteca": "library",
        "processos": "processes",
        "historico": "history",
        "configuracoes": "settings",
    }
    for name, tab_id in shots.items():
        win.navigate(tab_id)
        wait(1300)
        pm = win.grab()
        path = os.path.join(out_dir, f"{name}.png")
        pm.save(path)
        print(f"  ✔ {path}")

    monitor.stop()
    db.close()
    os._exit(0)


if __name__ == "__main__":
    main()
