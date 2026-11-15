"""Sessão de Game Boost: otimiza antes do jogo e restaura ao final.

O que a sessão faz (tudo reversível e registrado):
- Ativa plano de energia de desempenho (se configurado);
- Suspende (não fecha) apps em segundo plano da lista do perfil;
- Detecta o fim do processo do jogo e restaura tudo automaticamente.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

from PySide6.QtCore import QObject, Qt, QTimer, Signal

from nexus.core import safety
from nexus.core.settings import Settings
from nexus.games.models import Game
from nexus.games.profiles import COMMON_SUSPEND, get_profile
from nexus.optimization import power
from nexus.system import processes as sys_processes

log = logging.getLogger("nexus.booster")


@dataclass
class BoostState:
    active: bool = False
    game: Optional[Game] = None
    started_at: float = 0.0
    suspended: list[str] = field(default_factory=list)
    power_undo: Optional[dict] = None
    session_id: Optional[int] = None
    processes_to_watch: list[str] = field(default_factory=list)

    @property
    def duration_min(self) -> float:
        return (time.time() - self.started_at) / 60.0 if self.started_at else 0.0


class BoostSession(QObject):
    """Controla a sessão de boost e o auto-encerramento ao fechar o jogo."""

    state_changed = Signal(object)   # BoostState
    game_launched = Signal(object)   # Game detectado em execução
    log_message = Signal(str)
    session_ended = Signal(object)   # BoostState final

    # marshal thread-safe: start/stop podem ser chamados de um worker
    # (run_task roda em QThread; QTimer só pode ser tocado na sua thread)
    _watch_start_requested = Signal()
    _watch_stop_requested = Signal()

    def __init__(self, db, settings: Settings, parent: Optional[QObject] = None):
        super().__init__(parent)
        self._db = db
        self._settings = settings
        self.state = BoostState()
        self._watch_timer = QTimer(self)
        self._watch_timer.setInterval(4000)
        self._watch_timer.timeout.connect(self._watchdog)
        self._watch_start_requested.connect(
            self._watch_timer.start, Qt.ConnectionType.QueuedConnection)
        self._watch_stop_requested.connect(
            self._watch_timer.stop, Qt.ConnectionType.QueuedConnection)

    # ---------------------------------------------------------- sessão
    def start(self, game: Optional[Game] = None) -> tuple[bool, str]:
        if self.state.active:
            return False, "Já existe uma sessão de boost ativa."

        self.state = BoostState(active=True, game=game, started_at=time.time())
        profile = get_profile(game.profile_id) if game else get_profile("generic")

        msgs: list[str] = []

        # 1) Plano de energia
        if self._settings.get_bool("power_on_boost"):
            ok, msg, undo = power.activate_performance()
            if ok:
                self.state.power_undo = undo
                msgs.append("Plano de energia: desempenho")
            else:
                msgs.append(f"Energia: {msg}")

        # 2) Suspensão de apps em segundo plano
        suspend_list = list(
            set(self._settings.get_list("suspend_list") + profile.extra_suspend)
        )
        if game:
            # Não suspende o launcher da plataforma do jogo nem processos do jogo.
            platform_keep = {
                "steam": "steam.exe", "epic": "epicgameslauncher.exe",
                "riot": "riotclientservices.exe", "battlenet": "battle.net.exe",
            }
            keep = platform_keep.get(game.platform, "")
            suspend_list = [s for s in suspend_list if s.lower() != keep]
            for p in profile.process_names:
                suspend_list = [s for s in suspend_list if s.lower() != p.lower()]

        for proc in sys_processes.find_by_names(suspend_list):
            try:
                name = proc.name()
            except Exception:
                continue
            if safety.is_protected_process(name):
                continue
            ok, _ = sys_processes.suspend(proc.pid, name)
            if ok:
                self.state.suspended.append(name)
        if self.state.suspended:
            msgs.append(f"{len(self.state.suspended)} app(s) suspensos")

        # 3) Processos do jogo para monitorar encerramento
        if game and profile.process_names:
            self.state.processes_to_watch = list(profile.process_names)

        self.state.session_id = self._db.session_start(
            getattr(game, "id", None) if game else None,
            game.name if game else "Boost rápido",
            {"suspended": self.state.suspended, "power_undo": self.state.power_undo},
        )
        self._db.history_add(
            "session",
            f"Sessão de boost iniciada{' — ' + game.name if game else ''}",
            description="; ".join(msgs) or "Sessão iniciada.",
        )
        self.log_message.emit("Sessão de boost iniciada: " + "; ".join(msgs))
        self._watch_start_requested.emit()
        self.state_changed.emit(self.state)
        return True, "Sessão de boost iniciada."

    def stop(self, reason: str = "encerrada manualmente") -> tuple[bool, str]:
        if not self.state.active:
            return False, "Nenhuma sessão ativa."
        self._watch_stop_requested.emit()

        msgs: list[str] = []
        # 1) Retoma processos suspensos
        resumed = 0
        for proc in sys_processes.find_by_names(self.state.suspended):
            ok, _ = sys_processes.resume(proc.pid, proc.name())
            resumed += 1 if ok else 0
        if resumed:
            msgs.append(f"{resumed} app(s) retomados")

        # 2) Restaura plano de energia
        if self.state.power_undo and self.state.power_undo.get("previous_guid"):
            ok, msg = power.restore_plan(self.state.power_undo["previous_guid"])
            if ok:
                msgs.append("Plano de energia restaurado")
            else:
                msgs.append(f"Energia: {msg}")

        if self.state.session_id:
            self._db.session_end(
                self.state.session_id,
                {"suspended_resumed": resumed, "reason": reason},
            )
        duration = self.state.duration_min
        self._db.history_add(
            "session",
            "Sessão de boost encerrada",
            description=f"Duração: {duration:.0f} min. " + "; ".join(msgs),
        )
        self.log_message.emit(f"Sessão encerrada ({reason}). " + "; ".join(msgs))
        self.state.active = False
        self.state_changed.emit(self.state)
        self.session_ended.emit(self.state)
        return True, "Sessão encerrada e configurações restauradas."

    # ------------------------------------------------------- watchdog
    def _watchdog(self) -> None:
        """Encerra a sessão quando o jogo fecha; detecta jogos automaticamente."""
        if not self.state.active:
            self._watch_stop_requested.emit()
            return
        if self.state.game and self.state.processes_to_watch:
            alive = sys_processes.find_by_names(self.state.processes_to_watch)
            if not alive:
                self.stop(reason="jogo encerrado")

    def detect_running_game(self, games: list) -> Optional[Game]:
        """Retorna o jogo da biblioteca que está em execução neste momento."""
        watch: dict[str, Game] = {}
        for g in games:
            profile = get_profile(g.profile_id)
            for pn in profile.process_names:
                watch[pn.lower()] = g
            if g.exe_path:
                watch[Path(g.exe_path).name.lower()] = g
        running = sys_processes.find_by_names(list(watch.keys()))
        if running:
            name = running[0].name().lower()
            return watch.get(name)
        return None
