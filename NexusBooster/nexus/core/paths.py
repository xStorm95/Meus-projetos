"""Caminhos de dados do aplicativo (por sistema operacional)."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def _base_dir() -> Path:
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return Path(base) / "NexusBooster"
    return Path.home() / ".local" / "share" / "NexusBooster"


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_data_dir() -> Path:
    d = _base_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def logs_dir() -> Path:
    d = app_data_dir() / "logs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def db_path() -> Path:
    return app_data_dir() / "nexus.db"


def backup_dir() -> Path:
    """Pasta onde itens de inicialização desativados são guardados (reversível)."""
    d = app_data_dir() / "startup_backup"
    d.mkdir(parents=True, exist_ok=True)
    return d


def temp_dir() -> Path:
    d = app_data_dir() / "tmp"
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_file() -> Path:
    return logs_dir() / "nexus.log"


def exe_path() -> str:
    if is_frozen():
        return sys.executable
    return str(Path(__file__).resolve().parent.parent.parent / "main.py")


def asset_path(name: str) -> Path:
    """Caminho de um asset (assets/) — funciona em dev e no build PyInstaller."""
    if is_frozen():
        base = Path(getattr(sys, "_MEIPASS", "")) if getattr(sys, "_MEIPASS", "") else Path(sys.executable).parent
        return base / "assets" / name
    return Path(__file__).resolve().parent.parent.parent / "assets" / name
