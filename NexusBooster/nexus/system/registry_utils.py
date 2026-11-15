"""Acesso ao Registro do Windows (leitura/escrita/listagem) com fallback seguro."""

from __future__ import annotations

import logging
from typing import Any, Optional

log = logging.getLogger("nexus.registry")


class UnsupportedPlatform(RuntimeError):
    """Operação de registro fora do Windows."""


def _is_win() -> bool:
    import sys

    return sys.platform == "win32"


def _import_winreg():
    if not _is_win():
        raise UnsupportedPlatform("Registro disponível somente no Windows.")
    import winreg

    return winreg


def _hive(hive: str):
    winreg = _import_winreg()
    mapping = {
        "HKCU": winreg.HKEY_CURRENT_USER,
        "HKLM": winreg.HKEY_LOCAL_MACHINE,
    }
    return mapping[hive.upper()]


def read(hive: str, path: str, name: str, default: Any = None) -> Any:
    winreg = _import_winreg()
    try:
        with winreg.OpenKey(_hive(hive), path, 0, winreg.KEY_READ) as key:
            value, vtype = winreg.QueryValueEx(key, name)
            return value
    except FileNotFoundError:
        return default
    except OSError as exc:
        log.debug("registry read falhou %s\\%s\\%s: %s", hive, path, name, exc)
        return default


def write(hive: str, path: str, name: str, value: Any, vtype: Optional[int] = None) -> bool:
    winreg = _import_winreg()
    try:
        with winreg.CreateKeyEx(_hive(hive), path, 0, winreg.KEY_SET_VALUE) as key:
            if vtype is None:
                if isinstance(value, int):
                    vtype = winreg.REG_DWORD
                elif isinstance(value, bytes):
                    vtype = winreg.REG_BINARY
                else:
                    vtype = winreg.REG_SZ
                    value = str(value)
            winreg.SetValueEx(key, name, 0, vtype, value)
        return True
    except OSError as exc:
        log.warning("registry write falhou %s\\%s\\%s: %s", hive, path, name, exc)
        return False


def delete_value(hive: str, path: str, name: str) -> bool:
    winreg = _import_winreg()
    try:
        with winreg.OpenKey(_hive(hive), path, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, name)
        return True
    except FileNotFoundError:
        return True
    except OSError as exc:
        log.warning("registry delete falhou %s\\%s\\%s: %s", hive, path, name, exc)
        return False


def list_values(hive: str, path: str) -> dict[str, Any]:
    """Retorna {nome: valor} de uma chave de registro."""
    winreg = _import_winreg()
    result: dict[str, Any] = {}
    try:
        with winreg.OpenKey(_hive(hive), path, 0, winreg.KEY_READ) as key:
            i = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                    result[name] = value
                    i += 1
                except OSError:
                    break
    except FileNotFoundError:
        pass
    except OSError as exc:
        log.debug("registry list_values falhou %s\\%s: %s", hive, path, exc)
    return result


def key_exists(hive: str, path: str) -> bool:
    winreg = _import_winreg()
    try:
        with winreg.OpenKey(_hive(hive), path, 0, winreg.KEY_READ):
            return True
    except OSError:
        return False
