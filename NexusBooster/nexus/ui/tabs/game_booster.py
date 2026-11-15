"""Aba Game Booster: sessão de boost, auto-detecção e lista de suspensão."""

from __future__ import annotations

import time

from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.system import processes as sys_processes
from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Card,
    Pill,
    ThemeLabel,
    ToggleSwitch,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class GameBoosterTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._duration_timer = QTimer(self)
        self._duration_timer.setInterval(1000)
        self._duration_timer.timeout.connect(self._tick_duration)
        services.booster.state_changed.connect(self._on_state)

        # -------------------------------------------------- sessão atual
        session_card = Card("Sessão de boost", "rocket")
        self.session_status = ThemeLabel("Nenhuma sessão ativa", "title_sm")
        session_card.body_layout().addWidget(self.session_status)
        self.session_detail = ThemeLabel(
            "Ao iniciar, o Nexus Booster ativa o plano de energia de desempenho e "
            "suspende aplicativos em segundo plano. Ao encerrar (manualmente ou "
            "quando o jogo fecha), tudo é restaurado automaticamente.",
            "body_sm", wrap=True,
        )
        session_card.body_layout().addWidget(self.session_detail)

        btn_row = QHBoxLayout()
        self.start_btn = Button("Iniciar boost rápido", "primary", "zap")
        self.start_btn.clicked.connect(self._start_quick)
        self.stop_btn = Button("Encerrar sessão", "danger", "stop")
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self._stop)
        btn_row.addWidget(self.start_btn)
        btn_row.addWidget(self.stop_btn)
        btn_row.addStretch(1)
        session_card.body_layout().addLayout(btn_row)
        self.add(session_card)

        # --------------------------------------------- detecção automática
        auto_card = Card("Detecção automática de jogos", "gamepad")
        row1 = QHBoxLayout()
        self.auto_detect = ToggleSwitch(self.services.settings.get_bool("auto_detect_games"))
        lbl1 = ThemeLabel("Detectar quando um jogo é iniciado", "body")
        row1.addWidget(self.auto_detect)
        row1.addWidget(lbl1)
        row1.addStretch(1)
        auto_card.body_layout().addLayout(row1)

        row2 = QHBoxLayout()
        self.auto_boost = ToggleSwitch(self.services.settings.get_bool("auto_boost"))
        lbl2 = ThemeLabel("Iniciar boost automaticamente ao detectar um jogo", "body")
        row2.addWidget(self.auto_boost)
        row2.addWidget(lbl2)
        row2.addStretch(1)
        auto_card.body_layout().addLayout(row2)

        note = ThemeLabel(
            "A detecção monitora os processos dos jogos da sua Biblioteca — "
            "nenhum dado é enviado para a internet.", "caption", wrap=True,
        )
        auto_card.body_layout().addWidget(note)
        self.add(auto_card)

        self.auto_detect.toggled.connect(self._save_auto_detect)
        self.auto_boost.toggled.connect(self._save_auto_boost)

        # ---------------------------------------------- lista de suspensão
        list_card = Card("Aplicativos suspensos durante o boost", "pause")
        lnote = ThemeLabel(
            "Aplicativos SUSPENSOS (não fechados) durante os jogos e retomados depois. "
            "Processos essenciais do Windows e de segurança nunca são suspensos.",
            "body_sm", wrap=True,
        )
        list_card.body_layout().addWidget(lnote)

        self.suspend_list_box = QVBoxLayout()
        list_card.body_layout().addLayout(self.suspend_list_box)

        add_row = QHBoxLayout()
        self.suspend_input = QLineEdit()
        self.suspend_input.setPlaceholderText("Nome do processo, ex.: Discord.exe")
        add_btn = Button("Adicionar", "secondary", "plus")
        add_from_btn = Button("Escolher entre os processos em execução", "subtle")
        add_row.addWidget(self.suspend_input, 1)
        add_row.addWidget(add_btn)
        add_row.addWidget(add_from_btn)
        list_card.body_layout().addLayout(add_row)
        self.add(list_card)

        add_btn.clicked.connect(self._add_suspend)
        add_from_btn.clicked.connect(self._pick_running)

        self._render_suspend_list()

        # ----------------------------------------------------- favoritos
        fav_card = Card("Favoritos", "star")
        self.fav_box = QVBoxLayout()
        fav_card.body_layout().addLayout(self.fav_box)
        self.add(fav_card)
        self._render_favorites()

    # ------------------------------------------------------------ sessão
    def _start_quick(self) -> None:
        self.start_btn.set_loading(True, "Iniciando…")

        def job():
            return self.services.booster.start(None)

        def done(res) -> None:
            ok, msg = res
            self.start_btn.set_loading(False)
            toast_for(self, msg, "success" if ok else "warning")

        run_task(job, on_done=done)

    def _stop(self) -> None:
        self.stop_btn.set_loading(True, "Encerrando…")

        def job():
            return self.services.booster.stop()

        def done(res) -> None:
            ok, msg = res
            self.stop_btn.set_loading(False)
            toast_for(self, msg, "success" if ok else "warning")

        run_task(job, on_done=done)

    def _on_state(self, state) -> None:
        if state.active:
            game = state.game.name if state.game else "Boost rápido"
            self.session_status.setText(f"Sessão ativa — {game}")
            self.session_detail.setText(
                f"{len(state.suspended)} aplicativo(s) suspenso(s) · "
                f"restauração automática ao encerrar"
            )
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self._duration_timer.start()
        else:
            self.session_status.setText("Nenhuma sessão ativa")
            self.session_detail.setText(
                "Ao iniciar, o Nexus Booster ativa o plano de energia de desempenho e "
                "suspende aplicativos em segundo plano. Tudo é restaurado ao final."
            )
            self.start_btn.setEnabled(True)
            self.stop_btn.setEnabled(False)
            self._duration_timer.stop()

    def _tick_duration(self) -> None:
        state = self.services.booster.state
        if state.active:
            mins = (time.time() - state.started_at) / 60
            game = state.game.name if state.game else "Boost rápido"
            self.session_status.setText(
                f"Sessão ativa — {game} · {int(mins)} min"
            )

    # -------------------------------------------------------------- toggles
    def _save_auto_detect(self, checked: bool) -> None:
        self.services.settings.set("auto_detect_games", checked)
        if self.main is not None:
            if checked:
                self.main._autodetect_timer.start()
            else:
                self.main._autodetect_timer.stop()

    def _save_auto_boost(self, checked: bool) -> None:
        self.services.settings.set("auto_boost", checked)

    # ------------------------------------------------------- lista suspensão
    def _render_suspend_list(self) -> None:
        while self.suspend_list_box.count():
            item = self.suspend_list_box.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        items = self.services.settings.get_list("suspend_list")
        if not items:
            empty = ThemeLabel(
                "Lista vazia — adicione aplicativos que não usa durante os jogos.",
                "caption",
            )
            self.suspend_list_box.addWidget(empty)
            return
        for name in items:
            row = QFrame()
            row.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
            row.setStyleSheet("QFrame { background: transparent; border: none; }")
            lay = QHBoxLayout(row)
            lay.setContentsMargins(theme.pad("md"), 6, theme.pad("md"), 6)
            lay.setSpacing(theme.pad("md"))
            ic = QLabel()
            ic.setPixmap(icons.pixmap("pause", "muted", 15))
            lay.addWidget(ic)
            lbl = ThemeLabel(name, "body_sm")
            lay.addWidget(lbl, 1)
            status = sys_processes.find_by_names([name])
            lay.addWidget(Pill("em execução" if status else "não está rodando",
                               "success" if status else "muted"))
            rm = Button("Remover", "subtle")
            rm.clicked.connect(lambda _=False, n=name: self._remove_suspend(n))
            lay.addWidget(rm)
            self.suspend_list_box.addWidget(row)

    def _add_suspend(self) -> None:
        name = self.suspend_input.text().strip()
        if not name:
            return
        if "." not in name:
            name += ".exe"
        from nexus.core import safety

        if safety.is_protected_process(name):
            toast_for(self, f"'{name}' é um processo protegido e não pode ser suspenso.",
                      "error")
            return
        items = self.services.settings.get_list("suspend_list")
        if name.lower() not in [i.lower() for i in items]:
            items.append(name)
            self.services.settings.set("suspend_list", items)
        self.suspend_input.clear()
        self._render_suspend_list()

    def _remove_suspend(self, name: str) -> None:
        items = self.services.settings.get_list("suspend_list")
        items = [i for i in items if i.lower() != name.lower()]
        self.services.settings.set("suspend_list", items)
        self._render_suspend_list()

    def _pick_running(self) -> None:
        from nexus.ui.dialogs import ProcessPickerDialog

        dlg = ProcessPickerDialog(self.services, self)
        if dlg.exec() and dlg.selected:
            for name in dlg.selected:
                self.suspend_input.setText(name)
                self._add_suspend()

    # ----------------------------------------------------------- favoritos
    def _render_favorites(self) -> None:
        while self.fav_box.count():
            item = self.fav_box.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        favs = [g for g in self.services.db.games_all() if g.favorite]
        if not favs:
            empty = ThemeLabel(
                "Nenhum favorito ainda. Marque jogos com a estrela na Biblioteca de Jogos.",
                "caption", wrap=True,
            )
            self.fav_box.addWidget(empty)
            return
        from nexus.ui.tabs.library import GameTile

        tiles = QHBoxLayout()
        tiles.setSpacing(theme.pad("md"))
        for g in favs[:6]:
            tile = GameTile(g, self.services, small=True)
            tiles.addWidget(tile)
        wrap = QWidget()
        wrap.setLayout(tiles)
        self.fav_box.addWidget(wrap)

    def refresh(self) -> None:
        self._render_favorites()
        self._render_suspend_list()
