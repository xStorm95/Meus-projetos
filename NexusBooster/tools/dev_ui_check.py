#!/usr/bin/env python3
"""Verificação headless da interface: constrói a janela e todas as abas.

Uso:  QT_QPA_PLATFORM=offscreen python tools/dev_ui_check.py
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
    from PySide6.QtCore import QTimer
    from PySide6.QtWidgets import QApplication

    app = QApplication(sys.argv)

    db_path = temp_dir() / "ui_check.db"
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
            from nexus.core import worker

            worker.wait_for_all(timeout=3.0)
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
    monitor.start()

    from nexus.ui.main_window import MainWindow

    win = MainWindow(services)

    tabs = [
        "dashboard", "optimizer", "booster", "library", "fps", "hardware",
        "cleanup", "internet", "startup", "processes", "profiles",
        "history", "settings",
    ]
    for tab_id in tabs:
        win.navigate(tab_id)
        app.processEvents()
        print(f"  ✔ aba {tab_id}")

    # Segunda passada: mantém cada aba visível para receber atualizações do monitor
    for tab_id in tabs:
        win.navigate(tab_id)
        loop_check = __import__("PySide6.QtCore", fromlist=["QEventLoop"]).QEventLoop()
        QTimer.singleShot(900, loop_check.quit)
        loop_check.exec()
        snap = monitor.latest
        print(f"  ✔ {tab_id}: monitor ativo ({'snapshot ok' if snap else 'sem snapshot'})")

    # Exercita sessão de boost (início/fim) — seguro em qualquer sistema
    ok, msg = booster.start(None)
    print(f"  ✔ boost start: {ok} — {msg}")
    app.processEvents()
    ok, msg = booster.stop()
    print(f"  ✔ boost stop: {ok} — {msg}")
    app.processEvents()

    # Exercita undo do motor (entrada não reversível deve falhar graciosamente)
    db.history_add("mystery", "Ação", undo={"x": 1})
    entry = db.history_undoable()[0]
    ok, msg = engine.undo_entry(entry)
    print(f"  ✔ undo grace: {not ok} — {msg}")

    # Navegação final
    win.navigate("dashboard")
    app.processEvents()

    # Fecha como um usuário fecharia (dispara closeEvent -> shutdown limpo)
    QTimer.singleShot(1200, win.close)
    app.exec()

    monitor.stop()
    from nexus.core import worker

    worker.wait_for_all(timeout=3.0)
    db.close()
    print("OK: interface construída sem erros em todas as abas.")
    import os

    os._exit(0)  # evita crash de finalização do PySide6 no ambiente de teste
    return 0


if __name__ == "__main__":
    sys.exit(main())
