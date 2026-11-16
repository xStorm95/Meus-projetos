"""Execução assíncrona de funções em threads Qt com retorno por sinais."""

from __future__ import annotations

import traceback
from typing import Callable, Optional

from PySide6.QtCore import QObject, QThread, Signal


class _TaskSignals(QObject):
    done = Signal(object)
    fail = Signal(str)
    finished = Signal()


class FunctionTask(QThread):
    """Roda `fn` em uma thread e emite done(resultado) ou fail(mensagem)."""

    def __init__(self, fn: Callable[[], object], parent: Optional[QObject] = None):
        super().__init__(parent)
        self._fn = fn
        self.signals_obj = _TaskSignals()
        self.done = self.signals_obj.done
        self.fail = self.signals_obj.fail
        self.all_finished = self.signals_obj.finished

    def run(self) -> None:  # pragma: no cover - roda em thread
        try:
            result = self._fn()
            self.done.emit(result)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            self.fail.emit(f"{type(exc).__name__}: {exc}")
        finally:
            self.all_finished.emit()


_KEEPALIVE: list = []


def run_task(
    fn: Callable[[], object],
    on_done: Optional[Callable] = None,
    on_error: Optional[Callable] = None,
) -> FunctionTask:
    """Executa `fn` em segundo plano. Mantém referência até concluir.

    Sem ``on_error``, a falha é registrada no log (e portanto no painel
    "Registro de erros") — nunca engolida em silêncio.
    """
    task = FunctionTask(fn)

    def _cleanup():
        try:
            _KEEPALIVE.remove(task)
        except ValueError:
            pass

    def _default_error(msg: str) -> None:
        import logging

        logging.getLogger("nexus.worker").error(
            "tarefa em segundo plano falhou: %s", msg
        )

    if on_done is not None:
        task.done.connect(on_done)
    task.fail.connect(on_error if on_error is not None else _default_error)
    task.all_finished.connect(_cleanup)
    _KEEPALIVE.append(task)
    task.start()
    return task


def wait_for_all(timeout: float = 3.0) -> None:
    """Aguarda tarefas curtas concluírem (chamado no encerramento)."""
    import time as _time

    deadline = _time.time() + timeout
    while _KEEPALIVE and _time.time() < deadline:
        app = None
        try:
            from PySide6.QtWidgets import QApplication

            app = QApplication.instance()
        except Exception:
            pass
        if app is not None:
            app.processEvents()
        _time.sleep(0.05)
