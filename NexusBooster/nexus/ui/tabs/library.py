"""Aba Biblioteca de Jogos: grade visual com ícones, favoritos e ações."""

from __future__ import annotations

import os

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QBrush, QPainter, QColor, QLinearGradient, QPainterPath, QPen
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from nexus.core.database import GameRecord
from nexus.core.worker import run_task
from nexus.games.profiles import get_profile
from nexus.games.scanner import scan_all
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, Spinner, confirm, toast_for
from nexus.ui.tabs.base import BaseTab

PLATFORM_COLORS = {
    "steam": ("#1b2838", "#66c0f4"),
    "epic": ("#121225", "#9aa4ff"),
    "riot": ("#28123d", "#d13639"),
    "battlenet": ("#1a2233", "#148eff"),
    "manual": ("#10202a", "#00d4ff"),
    "other": ("#16202f", "#8b98ad"),
}


class GameTile(QFrame):
    """Cartão visual de jogo: avatar com iniciais, nome, plataforma e ações."""

    play_requested = Signal(object)     # GameRecord
    boost_requested = Signal(object)
    favorite_changed = Signal(object)

    def __init__(self, game: GameRecord, services, small: bool = False, parent=None):
        super().__init__(parent)
        self.game = game
        self.services = services
        self.small = small
        dark, neon = PLATFORM_COLORS.get(game.platform, PLATFORM_COLORS["other"])
        self._dark, self._neon = QColor(dark), QColor(neon)
        self.setFixedSize(190 if not small else 160, 258 if not small else 220)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setStyleSheet(
            f"""
            background: {theme.CARD}; border: 1px solid {theme.BORDER};
            border-radius: 14px;
            """
            f"QFrame:hover {{ border-color: {theme.ACCENT}; }}"
        )

        lay = QVBoxLayout(self)
        lay.setContentsMargins(10, 10, 10, 10)
        lay.setSpacing(6)

        # avatar
        avatar = _Avatar(game, self._neon, small)
        lay.addWidget(avatar, 1)

        # nome
        name = QLabel(game.name)
        name.setWordWrap(True)
        name.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        name.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 12px; font-weight: 700; background: transparent;"
        )
        name.setMaximumHeight(34)
        lay.addWidget(name)

        # plataforma
        pill = Pill(game.platform.upper(), "muted")
        pill.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        lay.addWidget(pill, 0, Qt.AlignmentFlag.AlignHCenter)

        # botões
        btns = QHBoxLayout()
        btns.setSpacing(4)
        self.fav_btn = QPushButton()
        self.fav_btn.setFlat(True)
        self.fav_btn.setFixedWidth(34)
        self._update_fav_icon()
        self.fav_btn.clicked.connect(lambda: self.favorite_changed.emit(self.game))

        play_btn = QPushButton()
        play_btn.setFlat(True)
        play_btn.setIcon(icons.icon("play", "accent", 16))
        play_btn.setToolTip("Jogar")
        play_btn.clicked.connect(lambda: self.play_requested.emit(self.game))

        boost_btn = QPushButton()
        boost_btn.setFlat(True)
        boost_btn.setIcon(icons.icon("zap", "warning", 16))
        boost_btn.setToolTip("Otimizar e jogar (inicia sessão de boost)")
        boost_btn.clicked.connect(lambda: self.boost_requested.emit(self.game))

        for b in (self.fav_btn, play_btn, boost_btn):
            btns.addWidget(b)
        lay.addLayout(btns)

    def _update_fav_icon(self) -> None:
        color = "warning" if self.game.favorite else "muted"
        self.fav_btn.setIcon(icons.icon("star", color, 16))
        self.fav_btn.setToolTip("Remover dos favoritos" if self.game.favorite else "Adicionar aos favoritos")

    def update_record(self, game: GameRecord) -> None:
        self.game = game
        self._update_fav_icon()


class _Avatar(QFrame):
    """Área do 'ícone' do jogo: gradiente por plataforma + iniciais + logo."""

    def __init__(self, game: GameRecord, neon: QColor, small: bool, parent=None):
        super().__init__(parent)
        self.game = game
        self._neon = neon
        self._small = small
        self.setMinimumHeight(96 if small else 128)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        radius = 10
        path = QPainterPath()
        path.addRoundedRect(0.5, 0.5, w - 1, h - 1, radius, radius)

        grad = QLinearGradient(0, 0, w, h)
        grad.setColorAt(0, self._neon.darker(260))
        grad.setColorAt(1, self._neon.darker(420))
        p.fillPath(path, QBrush(grad))

        # iniciais do jogo
        words = [t for t in self.game.name.split() if t.isalnum() or t.isdigit()]
        initials = "".join(t[0] for t in words[:2]).upper() or "G"
        p.setPen(QPen(self._neon.lighter(140)))
        f = p.font()
        f.setPointSizeF(30 if not self._small else 24)
        f.setBold(True)
        p.setFont(f)
        p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, initials)

        # ícone da plataforma (canto)
        icon_name = {"steam": "windows", "epic": "windows", "riot": "windows",
                     "battlenet": "windows", "manual": "edit"}.get(self.game.platform, "gamepad")
        pm = icons.pixmap(icon_name, "muted", 14)
        p.drawPixmap(w - 22, 8, pm)
        p.end()


class LibraryTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._games: list[GameRecord] = []

        # ----------------------------------------------------------- toolbar
        bar = QFrame()
        bar.setStyleSheet("background: transparent; border: none;")
        bar_l = QHBoxLayout(bar)
        bar_l.setContentsMargins(0, 0, 0, 0)
        bar_l.setSpacing(10)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Buscar jogo…")
        self.search.textChanged.connect(self._render)
        self.platform_filter = QComboBox()
        self.platform_filter.addItem("Todas as plataformas", "")
        for pid, label in (
            ("steam", "Steam"), ("epic", "Epic Games"), ("riot", "Riot Games"),
            ("battlenet", "Battle.net"), ("manual", "Adicionados manualmente"),
            ("other", "Outros"),
        ):
            self.platform_filter.addItem(label, pid)
        self.platform_filter.currentIndexChanged.connect(self._render)

        rescan = QPushButton("  Detectar jogos")
        rescan.setProperty("accent", True)
        rescan.setIcon(icons.icon("refresh", "#04121f", 16))
        rescan.clicked.connect(self._rescan)

        add_manual = QPushButton("  Adicionar manualmente")
        add_manual.setIcon(icons.icon("plus", "accent", 16))
        add_manual.clicked.connect(self._add_manual)

        bar_l.addWidget(self.search, 1)
        bar_l.addWidget(self.platform_filter)
        bar_l.addWidget(rescan)
        bar_l.addWidget(add_manual)
        self.add(bar)

        # ---------------------------------------------------------- grade
        from nexus.ui.components import SmoothScrollArea

        self.grid_card = Card("", "")
        self.scroll = SmoothScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        self.grid_host = QWidget()
        self.grid_host.setStyleSheet("background: transparent;")
        self.grid = QGridLayout(self.grid_host)
        self.grid.setContentsMargins(0, 0, 0, 0)
        self.grid.setSpacing(14)
        self.scroll.setWidget(self.grid_host)
        self.grid_card.body_layout().addWidget(self.scroll)
        self.add(self.grid_card, 1)

        self._load()

    # -------------------------------------------------------------- dados
    def _load(self) -> None:
        self._games = self.services.db.games_all()
        self._render()

    def _render(self) -> None:
        # limpa grade
        while self.grid.count():
            item = self.grid.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        text = self.search.text().lower().strip()
        platform = self.platform_filter.currentData() or ""
        games = [
            g for g in self._games
            if (not text or text in g.name.lower())
            and (not platform or g.platform == platform)
        ]

        if not games:
            from nexus.ui.components import EmptyState

            if not self._games:
                self.grid.addWidget(EmptyState(
                    "gamepad", "Nenhum jogo detectado",
                    "Clique em 'Detectar jogos' para procurar Steam, Epic Games, Riot "
                    "e atalhos do Menu Iniciar — ou adicione manualmente.",
                    action_text="Detectar jogos agora", on_action=self._rescan,
                ), 0, 0)
            else:
                self.grid.addWidget(EmptyState(
                    "search", "Nada encontrado",
                    "Nenhum jogo corresponde ao filtro atual.",
                ), 0, 0)
            return

        cols = max(1, self.scroll.width() // 210)
        self._last_cols = cols
        for i, g in enumerate(games):
            tile = GameTile(g, self.services)
            tile.play_requested.connect(self._play)
            tile.boost_requested.connect(self._boost_and_play)
            tile.favorite_changed.connect(self._toggle_favorite)
            self.grid.addWidget(tile, i // cols, i % cols)
        self.grid.setRowStretch(self.grid.rowCount(), 1)
        self.grid.setColumnStretch(cols, 1)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        # re-renderiza apenas quando o nº de colunas muda (evita loops)
        cols = max(1, self.scroll.width() // 210)
        if cols != getattr(self, "_last_cols", None):
            self._last_cols = cols
            self._render()

    # ------------------------------------------------------------- ações
    def _rescan(self) -> None:
        self._scan_toast = toast_for(self, "Procurando jogos instalados…", "info", "search")

        def job():
            return scan_all(progress=lambda msg: None)

        def done(games) -> None:
            for g in games:
                self.services.db.games_upsert(
                    GameRecord(
                        id=None, name=g.name, platform=g.platform, exe_path=g.exe_path,
                        launch_cmd=g.launch_cmd, profile_id=g.profile_id,
                    )
                )
            self._load()
            toast_for(
                self,
                f"Varredura concluída: {len(games)} jogo(s) encontrado(s).",
                "success",
            )

        def fail(msg) -> None:
            toast_for(self, f"Falha na varredura: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)

    def _add_manual(self) -> None:
        from nexus.ui.dialogs import AddGameDialog

        dlg = AddGameDialog(self.services, self)
        if dlg.exec() and dlg.game:
            self.services.db.games_upsert(dlg.game)
            self._load()
            toast_for(self, f"'{dlg.game.name}' adicionado à biblioteca.", "success")

    def _toggle_favorite(self, game: GameRecord) -> None:
        self.services.db.games_update(game.id, favorite=not game.favorite)
        self._load()

    def _play(self, game: GameRecord) -> None:
        from nexus.ui.dialogs import launch_game

        launch_game(self.services, game, self)

    def _boost_and_play(self, game: GameRecord) -> None:
        from nexus.ui.dialogs import launch_game

        if self.services.booster.state.active:
            toast_for(self, "Já existe uma sessão de boost ativa.", "warning")
            launch_game(self.services, game, self)
            return

        def job():
            return self.services.booster.start(game)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "warning")
            if ok:
                launch_game(self.services, game, self)

        run_task(job, on_done=done)
