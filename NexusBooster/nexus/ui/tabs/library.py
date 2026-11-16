"""Aba Biblioteca de Jogos: grade visual com ícones, favoritos e ações."""

from __future__ import annotations

from PySide6.QtCore import QEvent, QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QPainter, QColor, QLinearGradient, QPainterPath, QPen
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from nexus.core.database import GameRecord
from nexus.core.worker import run_task
from nexus.games.profiles import get_profile
from nexus.games.scanner import scan_all
from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Card,
    EmptyState,
    Pill,
    SearchBox,
    SmoothScrollArea,
    ThemeLabel,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab

# Cor de marca por plataforma (tom do avatar + detalhes).
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
        self._hover = False
        self.setFixedSize(190 if not small else 160, 258 if not small else 220)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setAccessibleName(f"Jogo {game.name}")

        lay = QVBoxLayout(self)
        lay.setContentsMargins(10, 10, 10, 10)
        lay.setSpacing(6)

        # avatar
        avatar = _Avatar(game, self._neon, small)
        lay.addWidget(avatar, 1)

        # nome
        name = ThemeLabel(game.name, "body_sm", wrap=True)
        name.setAlignment(Qt.AlignmentFlag.AlignHCenter)
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
        play_btn.setAccessibleName(f"Jogar {game.name}")
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
        self.fav_btn.setToolTip(
            "Remover dos favoritos" if self.game.favorite else "Adicionar aos favoritos"
        )

    def update_record(self, game: GameRecord) -> None:
        self.game = game
        self._update_fav_icon()

    def enterEvent(self, event) -> None:
        self._hover = True
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event) -> None:
        self._hover = False
        self.update()
        super().leaveEvent(event)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        radius = 12.0
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)
        path = QPainterPath()
        path.addRoundedRect(rect, radius, radius)
        p.fillPath(path, QColor(theme.CARD))
        border = theme.ACCENT if self._hover else theme.BORDER
        p.setPen(QPen(QColor(border), 1.0 if not self._hover else 1.5))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(rect, radius, radius)
        p.end()


class _Avatar(QFrame):
    """Área do 'ícone' do jogo: gradiente por plataforma + iniciais + logo."""

    def __init__(self, game: GameRecord, neon: QColor, small: bool, parent=None):
        super().__init__(parent)
        self.game = game
        self._neon = neon
        self._small = small
        self.setMinimumHeight(96 if small else 128)
        self.setStyleSheet("background: transparent; border: none;")

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        radius = 9
        path = QPainterPath()
        path.addRoundedRect(QRectF(0.5, 0.5, w - 1, h - 1), radius, radius)

        grad = QLinearGradient(0, 0, w, h)
        base = QColor(theme.SURFACE1)
        grad.setColorAt(0, QColor(
            (self._neon.red() + base.red()) // 3,
            (self._neon.green() + base.green()) // 3,
            (self._neon.blue() + base.blue()) // 3,
        ))
        grad.setColorAt(1, base)
        p.fillPath(path, QBrush(grad))

        # iniciais do jogo
        words = [t for t in self.game.name.split() if t.isalnum() or t.isdigit()]
        initials = "".join(t[0] for t in words[:2]).upper() or "G"
        p.setPen(QPen(self._neon.lighter(150)))
        f = p.font()
        f.setPixelSize(30 if not self._small else 24)
        f.setBold(True)
        p.setFont(f)
        p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, initials)

        # ícone da plataforma (canto)
        icon_name = {"steam": "windows", "epic": "windows", "riot": "windows",
                     "battlenet": "windows", "manual": "edit"}.get(self.game.platform,
                                                                   "gamepad")
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
        bar_l.setSpacing(theme.pad("sm"))

        self.search = SearchBox("Buscar jogo…")
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

        rescan = Button("Detectar jogos", "primary", "refresh")
        rescan.clicked.connect(self._rescan)

        add_manual = Button("Adicionar manualmente", "secondary", "plus")
        add_manual.clicked.connect(self._add_manual)

        bar_l.addWidget(self.search, 1)
        bar_l.addWidget(self.platform_filter)
        bar_l.addWidget(rescan)
        bar_l.addWidget(add_manual)
        self.add(bar)

        # ------------------------------------------------- grade + detalhes
        content = QHBoxLayout()
        content.setSpacing(theme.pad("md"))

        self.grid_card = Card("", "")
        self.scroll = SmoothScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        self.grid_host = QWidget()
        self.grid_host.setObjectName("libraryGrid")
        self.grid_host.setStyleSheet("#libraryGrid { background: transparent; }")
        self.grid = QGridLayout(self.grid_host)
        self.grid.setContentsMargins(0, 0, 0, 0)
        self.grid.setSpacing(theme.pad("md"))
        self.scroll.setWidget(self.grid_host)
        content.addWidget(self.grid_card, 1)

        # painel de detalhes (seleção da grade)
        self.details = _DetailsPanel()
        self.details.setVisible(False)
        content.addWidget(self.details)
        self.add_layout(content, 1)

        self._load()

    # -------------------------------------------------------------- dados
    def _load(self) -> None:
        from nexus.core.worker import run_task

        # leitura do banco fora da thread da interface
        def job():
            return self.services.db.games_all()

        def done(games) -> None:
            self._games = games or []
            self._render()

        run_task(job, done)

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
            tile.installEventFilter(self)
            self.grid.addWidget(tile, i // cols, i % cols)
        self.grid.setRowStretch(self.grid.rowCount(), 1)
        self.grid.setColumnStretch(cols, 1)

    def eventFilter(self, obj, event) -> bool:
        if event.type() == QEvent.Type.HoverEnter and isinstance(obj, GameTile):
            self.details.show_game(obj.game)
            self.details.setVisible(True)
        return super().eventFilter(obj, event)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        # re-renderiza apenas quando o nº de colunas muda (evita loops)
        cols = max(1, self.scroll.width() // 210)
        if cols != getattr(self, "_last_cols", None):
            self._last_cols = cols
            self._render()

    # ------------------------------------------------------------- ações
    def _rescan(self) -> None:
        self._scan_toast = toast_for(self, "Procurando jogos instalados…", "info")

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


class _DetailsPanel(QFrame):
    """Painel lateral com detalhes do jogo em foco na grade."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedWidth(250)
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        self.setStyleSheet("QFrame { background: transparent; border: none; }")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("md"), 0, 0, 0)
        lay.setSpacing(theme.pad("sm"))

        self.avatar = _AvatarPlaceholder()
        lay.addWidget(self.avatar)
        self.name = ThemeLabel("—", "title_sm", wrap=True)
        lay.addWidget(self.name)
        self.platform = Pill("—", "muted")
        lay.addWidget(self.platform)
        self.profile_lbl = ThemeLabel("—", "body_sm", wrap=True)
        lay.addWidget(self.profile_lbl)
        self.path_lbl = ThemeLabel("", "caption", wrap=True)
        lay.addWidget(self.path_lbl)
        lay.addStretch(1)

    def show_game(self, game: GameRecord) -> None:
        prof = get_profile(game.profile_id)
        self.name.setText(game.name)
        self.platform.setText(game.platform.upper())
        self.platform.set_kind("muted")
        self.profile_lbl.setText(
            f"Perfil: {prof.game_name}\n{prof.platform_note or 'ajustes genéricos'}"
        )
        self.path_lbl.setText(game.exe_path or "caminho não registrado")
        self.avatar.set_game(game)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        radius = float(theme.RADIUS["card"])
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(theme.CARD))
        p.drawRoundedRect(rect, radius, radius)
        p.setPen(QPen(QColor(theme.BORDER), 1.0))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(rect, radius, radius)
        p.end()


class _AvatarPlaceholder(QFrame):
    """Pré-visualização da capa do jogo no painel de detalhes."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._game = None
        self.setFixedHeight(120)
        self.setStyleSheet("background: transparent; border: none;")

    def set_game(self, game) -> None:
        self._game = game
        self.update()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        path = QPainterPath()
        path.addRoundedRect(QRectF(0.5, 0.5, w - 1, h - 1), 9, 9)
        neon = QColor(PLATFORM_COLORS.get(
            self._game.platform if self._game else "other",
            PLATFORM_COLORS["other"],
        )[1])
        base = QColor(theme.SURFACE1)
        grad = QLinearGradient(0, 0, w, h)
        grad.setColorAt(0, QColor(
            (neon.red() + base.red()) // 3,
            (neon.green() + base.green()) // 3,
            (neon.blue() + base.blue()) // 3,
        ))
        grad.setColorAt(1, base)
        p.fillPath(path, QBrush(grad))
        if self._game:
            words = [t for t in self._game.name.split() if t.isalnum() or t.isdigit()]
            initials = "".join(t[0] for t in words[:2]).upper() or "G"
            p.setPen(QPen(neon.lighter(150)))
            f = p.font()
            f.setPixelSize(26)
            f.setBold(True)
            p.setFont(f)
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, initials)
        p.end()
