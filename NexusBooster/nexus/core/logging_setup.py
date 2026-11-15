"""Configuração de logging com rotação + captura de erros para o banco."""

from __future__ import annotations

import logging
import logging.handlers
import traceback

_LOG = None
_ERROR_SINK = None  # callback(module, message, traceback)


def set_error_sink(callback) -> None:
    global _ERROR_SINK
    _ERROR_SINK = callback


def setup_logging() -> logging.Logger:
    global _LOG
    if _LOG is not None:
        return _LOG

    from nexus.core.paths import logs_dir

    logger = logging.getLogger("nexus")
    logger.setLevel(logging.DEBUG)

    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.handlers.RotatingFileHandler(
        logs_dir() / "nexus.log",
        maxBytes=1_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    console = logging.StreamHandler()
    console.setLevel(logging.INFO)
    console.setFormatter(fmt)
    logger.addHandler(console)

    class ErrorCapture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            if record.levelno >= logging.ERROR and _ERROR_SINK:
                try:
                    _ERROR_SINK(
                        record.name,
                        record.getMessage(),
                        record.exc_text or "",
                    )
                except Exception:
                    pass

    logger.addHandler(ErrorCapture())

    _LOG = logger
    return logger


def log_exception(module: str, exc: BaseException) -> None:
    logging.getLogger("nexus").exception(
        "[%s] %s: %s", module, type(exc).__name__, exc
    )


def format_exception(exc: BaseException) -> str:
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
