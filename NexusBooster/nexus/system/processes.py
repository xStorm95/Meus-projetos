"""Gerenciamento de processos com proteção de processos essenciais."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

import psutil

from nexus.core import safety

log = logging.getLogger("nexus.processes")


@dataclass
class ProcInfo:
    pid: int
    name: str
    cpu: float
    mem_mb: float
    status: str
    exe: str
    username: str = ""
    suspended: bool = False


def list_processes() -> list[ProcInfo]:
    """Lista processos com CPU/RAM (uma amostra; CPU ~ agregada do psutil)."""
    procs: list[ProcInfo] = []
    for p in psutil.process_iter(
        ["pid", "name", "cpu_percent", "memory_info", "status", "exe", "username"]
    ):
        try:
            info = p.info
            mem = info.get("memory_info")
            procs.append(
                ProcInfo(
                    pid=info["pid"],
                    name=(info.get("name") or "")[:60] or f"PID {info['pid']}",
                    cpu=float(info.get("cpu_percent") or 0.0),
                    mem_mb=(mem.rss / 1024**2) if mem else 0.0,
                    status=info.get("status") or "",
                    exe=info.get("exe") or "",
                    username=info.get("username") or "",
                    suspended=info.get("status") == "stopped",
                )
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return procs


def top_consumers(n: int = 8, by: str = "cpu") -> list[ProcInfo]:
    procs = list_processes()
    key = (lambda p: p.cpu) if by == "cpu" else (lambda p: p.mem_mb)
    return sorted(procs, key=key, reverse=True)[:n]


def _get(pid_or_name: int | str) -> Optional[psutil.Process]:
    try:
        if isinstance(pid_or_name, int):
            return psutil.Process(pid_or_name)
        for p in psutil.process_iter(["name", "pid"]):
            if (p.info.get("name") or "").lower() == pid_or_name.lower():
                return psutil.Process(p.info["pid"])
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return None
    return None


def guard_process(name: str) -> Optional[str]:
    """Retorna mensagem de erro se o processo é protegido; None se pode mexer."""
    if safety.is_protected_process(name):
        return (
            f"'{name}' é um processo essencial do Windows e não pode ser "
            "modificado (proteção de segurança do Nexus Booster)."
        )
    return None


def terminate(pid: int, name: str = "") -> tuple[bool, str]:
    if name and (err := guard_process(name)):
        return False, err
    p = _get(pid)
    if not p:
        return False, "Processo não encontrado."
    try:
        p.terminate()
        gone, _ = psutil.wait_procs([p], timeout=3)
        if gone:
            return True, f"Processo '{p.name()}' finalizado."
        p.kill()
        return True, f"Processo '{p.name()}'' finalizado (forçado)."
    except psutil.AccessDenied:
        return False, "Acesso negado — execute o Nexus Booster como administrador."
    except (psutil.NoSuchProcess, Exception) as exc:  # noqa: BLE001
        return False, f"Falha ao finalizar: {exc}"


def suspend(pid: int, name: str = "") -> tuple[bool, str]:
    if name and (err := guard_process(name)):
        return False, err
    p = _get(pid)
    if not p:
        return False, "Processo não encontrado."
    try:
        if p.status() == psutil.STATUS_STOPPED:
            return True, f"'{p.name()}' já está suspenso."
        p.suspend()
        return True, f"'{p.name()}' suspenso."
    except psutil.AccessDenied:
        return False, "Acesso negado — execute como administrador."
    except Exception as exc:  # noqa: BLE001
        return False, f"Falha ao suspender: {exc}"


def resume(pid: int, name: str = "") -> tuple[bool, str]:
    p = _get(pid)
    if not p:
        return False, "Processo não encontrado (pode já ter sido encerrado)."
    try:
        if p.status() != psutil.STATUS_STOPPED:
            return True, f"'{p.name()}' já está em execução."
        p.resume()
        return True, f"'{p.name()}' retomado."
    except psutil.AccessDenied:
        return False, "Acesso negado — execute como administrador."
    except Exception as exc:  # noqa: BLE001
        return False, f"Falha ao retomar: {exc}"


def find_by_names(names: list[str]) -> list[psutil.Process]:
    """Processos ativos cujo nome esteja na lista (case-insensitive)."""
    wanted = {n.lower() for n in names}
    found = []
    for p in psutil.process_iter(["name", "pid"]):
        nm = (p.info.get("name") or "").lower()
        if nm in wanted:
            try:
                found.append(psutil.Process(p.info["pid"]))
            except psutil.NoSuchProcess:
                continue
    return found
