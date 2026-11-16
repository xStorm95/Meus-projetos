"""Bootstrap do aplicativo: logging, serviços, tema e janela principal."""

from __future__ import annotations

import logging
import os
import sys

_STREAMS_KEEPALIVE: list = []


def _ensure_streams() -> None:
    """Corrige builds PyInstaller 'sem console' (sys.stdout/stderr = None).

    No modo windowed o PyInstaller deixa stdout/stderr como None; qualquer
    biblioteca que escreva neles (faulthandler, logging, avisos do Qt) falha
    com 'RuntimeError: sys.stderr is None'. Redireciona para o log do app
    (ou devnull) ANTES de qualquer outro import.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return
    try:
        from nexus.core.paths import logs_dir

        target = open(logs_dir() / "stderr.log", "w", encoding="utf-8", errors="replace")
    except Exception:
        target = open(os.devnull, "w", encoding="utf-8")
    _STREAMS_KEEPALIVE.append(target)
    if sys.stdout is None:
        sys.stdout = target
    if sys.stderr is None:
        sys.stderr = target


_ensure_streams()

import faulthandler  # noqa: E402

faulthandler.enable()

from PySide6.QtWidgets import QApplication, QMessageBox  # noqa: E402

from nexus import __version__  # noqa: E402
from nexus.core.database import Database  # noqa: E402
from nexus.core.logging_setup import setup_logging  # noqa: E402
from nexus.core.paths import db_path  # noqa: E402
from nexus.core.settings import Settings  # noqa: E402
from nexus.games.booster import BoostSession  # noqa: E402
from nexus.optimization.engine import OptimizationEngine  # noqa: E402
from nexus.services import Services  # noqa: E402
from nexus.system.monitor_service import MonitorService  # noqa: E402

log = logging.getLogger("nexus.app")

# Referência global ao servidor de instância única (mantém vivo).
_SINGLE_INSTANCE_SERVER = None


def create_services() -> Services:
    db = Database(db_path())
    settings = Settings(db)
    monitor = MonitorService(settings.get_int("monitor_interval"))
    engine = OptimizationEngine(db)
    booster = BoostSession(db, settings)
    # liga o capturador de erros do logging ao banco: tudo que for
    # WARNING+ aparece no painel "Registro de erros" do Histórico
    from nexus.core.logging_setup import set_error_sink

    set_error_sink(db.error_add)
    return Services(db=db, settings=settings, monitor=monitor, engine=engine, booster=booster)


def _excepthook(exc_type, exc, tb) -> None:  # pragma: no cover
    log.critical("exceção não tratada: %s", exc, exc_info=(exc_type, exc, tb))
    if QApplication.instance() is not None:
        msg = QMessageBox()
        msg.setWindowTitle("Erro inesperado")
        msg.setText(
            f"Ocorreu um erro inesperado:\n\n{type(exc).__name__}: {exc}\n\n"
            "O registro completo foi salvo no log do aplicativo."
        )
        msg.exec()


def run() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("DK")
    app.setApplicationVersion(__version__)
    app.setOrganizationName("DK")

    # barra de título escura no Windows 10/11
    if sys.platform == "win32":
        try:
            import ctypes

            hwnd = int(app.winId())
            for attr in (20, 19):  # DWMWA_USE_IMMERSIVE_DARK_MODE
                if ctypes.windll.dwmapi.DwmSetWindowAttribute(
                    hwnd, attr, ctypes.byref(ctypes.c_int(1)), 4
                ) == 0:
                    break
        except Exception:
            pass

    setup_logging()
    log.info("DK %s iniciando…", __version__)

    # Garante uma única instância em execução.
    from nexus import singleinstance

    if singleinstance.is_already_running():
        from PySide6.QtWidgets import QMessageBox

        log.warning("outra instância já está em execução — encerrando.")
        QMessageBox.information(
            None,
            "DK",
            "O DK já está em execução.\nVerifique a bandeja do sistema "
            "ou a barra de tarefas.",
        )
        return 0
    # Mantém o servidor do singleton vivo enquanto o app rodar.
    global _SINGLE_INSTANCE_SERVER

    _SINGLE_INSTANCE_SERVER = singleinstance.listen()

    services = create_services()
    # Erros de logging também entram no banco (visível no Histórico)
    from nexus.core.logging_setup import set_error_sink

    set_error_sink(lambda mod, msg, tb: services.db.error_add(mod, msg, tb))
    sys.excepthook = _excepthook

    from nexus.ui.theme import apply_theme

    apply_theme(app, services.settings.get_str("accent") or "neon")

    # Splash de abertura com a imagem da marca
    from nexus.ui.splash import NexusSplash

    splash = NexusSplash()
    splash.show()
    splash.message("Carregando interface…")
    app.processEvents()

    from nexus.ui.main_window import MainWindow
    from nexus.ui.optimizer_wizard import OptimizerWizard

    win = MainWindow(services)
    win.optimize_requested.connect(
        lambda: (OptimizerWizard(services, win).exec())
    )
    splash.message("Preparando monitoramento…")
    app.processEvents()
    win.show()
    services.start()
    splash.message("Pronto — bom jogo! ⚡")
    from PySide6.QtCore import QTimer

    QTimer.singleShot(650, splash.close)

    code = app.exec()
    log.info("DK encerrado (código %s).", code)
    logging.shutdown()
    # Saída imediata: evita crashes conhecidos de finalização do PySide6
    # (todo recurso já foi encerrado de forma limpa acima).
    import os

    os._exit(code)
