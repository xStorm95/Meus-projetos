"""Janela principal: sidebar retrátil, cabeçalho de página, atalhos e statusbar."""

from __future__ import annotations

import logging
from typing import Optional

from PySide6.QtCore import QEvent, QEasingCurve, QRectF, Qt, QTimer, QVariantAnimation, Signal
from PySide6.QtGui import (
    QCloseEvent,
    QColor,
    QFont,
    QIcon,
    QKeySequence,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
    QShortcut,
)
from PySide6.QtWidgets import (
    QGraphicsDropShadowEffect,
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMenu,
    QStackedWidget,
    QSystemTrayIcon,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

from nexus import __version__
from nexus.core import elevation
from nexus.ui import icons, theme
from nexus.ui.components import Button, ThemeLabel, ToastHost, toast_for

log = logging.getLogger("nexus.ui.main")

# (id, ícone, rótulo, grupo) — agrupado por jornada de uso
NAV_ITEMS = [
    ("dashboard", "dashboard", "Dashboard", 1),
    ("optimizer", "gauge", "PC Optimizer", 1),
    ("cleanup", "broom", "Limpeza Avançada", 1),
    ("processes", "list", "Processos", 1),
    ("hardware", "cpu", "Hardware Monitor", 1),
    ("booster", "rocket", "Game Booster", 2),
    ("library", "gamepad", "Biblioteca de Jogos", 2),
    ("fps", "activity", "FPS Monitor", 2),
    ("internet", "globe", "Internet Boost", 3),
    ("startup", "power", "Inicialização", 4),
    ("profiles", "sliders", "Perfis", 4),
    ("history", "history", "Histórico", 4),
    ("settings", "settings", "Configurações", 4),
]

GROUP_LABELS = {1: "Desempenho", 2: "Jogos", 3: "Rede", 4: "Sistema"}

SIDEBAR_WIDE = 224
SIDEBAR_COMPACT = 60


def _rounded_pixmap(pm: QPixmap, size: int, radius: int = 10) -> QPixmap:
    """Redimensiona a imagem com cantos arredondados (ícone da janela/sidebar)."""
    out = QPixmap(size, size)
    out.fill(Qt.GlobalColor.transparent)
    p = QPainter(out)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    path = QPainterPath()
    path.addRoundedRect(QRectF(0.5, 0.5, size - 1, size - 1), radius, radius)
    p.setClipPath(path)
    p.drawPixmap(0, 0, size, size, pm)
    p.setClipping(False)
    p.setPen(QPen(QColor(theme.BORDER_STRONG), 1))
    p.drawPath(path)
    p.end()
    return out


def _brand_pixmap(size: int) -> QPixmap:
    return icons.brand_pixmap(size)


class NavButton(QFrame):
    """Item da sidebar: indicador lateral de acento + hover suave."""

    clicked = Signal(str)

    def __init__(self, item_id: str, icon_name: str, label: str, parent=None):
        super().__init__(parent)
        self._id = item_id
        self._icon_name = icon_name
        self._label_text = label
        self._active = False
        self._hover = False
        self._hover_level = 0.0
        self._indicator = 0.0
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(36)
        self.setToolTip(label)

        self._anim = QVariantAnimation(self)
        self._anim.valueChanged.connect(self._on_anim)
        self._hover_anim = QVariantAnimation(self)
        self._hover_anim.valueChanged.connect(self._on_hover_anim)
        theme.manager.changed.connect(self.update)
        theme.manager.changed.connect(self._refresh_glow)
        self.setAccessibleName(label)
        # brilho neon permanente no item ativo da navegação
        self._glow = QGraphicsDropShadowEffect(self)
        self._glow.setBlurRadius(26)
        self._glow.setOffset(0, 0)
        self._glow.setEnabled(False)
        self.setGraphicsEffect(self._glow)

    def _on_hover_anim(self, v: float) -> None:
        self._hover_level = v
        self.update()

    def _animate_hover(self, target: float) -> None:
        d = theme.dur("fast")
        if d <= 0:
            self._hover_level = target
            self.update()
            return
        self._hover_anim.stop()
        self._hover_anim.setDuration(d)
        self._hover_anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._hover_anim.setStartValue(self._hover_level)
        self._hover_anim.setEndValue(target)
        self._hover_anim.start()

    def _on_anim(self, v: float) -> None:
        self._indicator = v
        self.update()

    def _refresh_glow(self) -> None:
        # brilho acompanha o acento/tema escolhido e some se ativo=não
        on = self._active and not theme.reduce_motion()
        if on:
            c = QColor(theme.ACCENT)
            c.setAlpha(160)
            self._glow.setColor(c)
        self._glow.setEnabled(on)

    def set_active(self, active: bool) -> None:
        self._active = active
        self._refresh_glow()
        d = theme.dur("fast")
        if d <= 0:
            self._indicator = 1.0 if active else 0.0
            self.update()
            return
        self._anim.stop()
        self._anim.setDuration(d)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.setStartValue(self._indicator)
        self._anim.setEndValue(1.0 if active else 0.0)
        self._anim.start()

    def enterEvent(self, event) -> None:
        self._hover = True
        self._animate_hover(1.0)
        super().enterEvent(event)

    def leaveEvent(self, event) -> None:
        self._hover = False
        self._animate_hover(0.0)
        super().leaveEvent(event)

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self._id)
        else:
            super().mousePressEvent(event)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        compact = w < (SIDEBAR_WIDE + SIDEBAR_COMPACT) / 2

        if self._hover_level > 0.01 or self._active:
            alpha = (22 if self._active else 0) + int(14 * self._hover_level)
            bg = QColor(theme.with_alpha(theme.ACCENT, alpha))
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(bg)
            p.drawRoundedRect(QRectF(4, 2, w - 8, h - 4), 7, 7)

        # indicador lateral
        if self._indicator > 0.01:
            acc = QColor(theme.ACCENT)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(acc)
            ind_h = (h - 12) * self._indicator
            p.drawRoundedRect(QRectF(4, (h - ind_h) / 2, 3, ind_h), 1.5, 1.5)

        # ícone
        icon_size = 18
        if compact:
            ix = (w - icon_size) / 2
        else:
            ix = 16
        color = "accent_text" if self._active else ("text" if self._hover else "muted")
        p.drawPixmap(int(ix), (h - icon_size) // 2,
                     icons.pixmap(self._icon_name, color, icon_size))

        # rótulo
        if not compact:
            p.setFont(QFont())
            f = p.font()
            f.setPixelSize(13)
            f.setWeight(QFont.Weight.DemiBold if self._active else QFont.Weight.Normal)
            p.setFont(f)
            p.setPen(QColor(theme.TEXT if self._active else theme.TEXT_MUTED))
            p.drawText(QRectF(ix + icon_size + 10, 0, w - ix - icon_size - 18, h),
                       Qt.AlignmentFlag.AlignVCenter, self._label_text)
        p.end()


class MainWindow(QMainWindow):
    optimize_requested = Signal()

    def __init__(self, services):
        super().__init__()
        self.services = services
        self.setWindowTitle(f"DK — Otimizador de Desempenho {__version__}")
        self.setMinimumSize(1120, 700)
        self.resize(1340, 800)

        # tema salvo (modo + acento + densidade) — lido antes de construir
        s = services.settings
        mode = s.get_str("theme_mode") or "dark"
        # migração única da identidade neon: o fundo escuro profundo passa a
        # ser o padrão do DK — o tema claro segue a um clique nas Configurações
        if not s.get_bool("theme_migrated_neon"):
            s.set("theme_mode", "dark")
            s.set("theme_migrated_neon", True)
            mode = "dark"
        if mode == "system":
            mode = "dark" if theme.system_prefers_dark() else "light"
        accent_key = s.get_str("accent") or None
        # migração única: quem usava o antigo padrão "neon" sem escolher
        # explicitamente passa para o "roxo" (cor do novo ícone da marca)
        if accent_key in ("", "neon") and not s.get_bool("accent_migrated_roxo"):
            accent_key = "roxo"
            s.set("accent", "roxo")
            s.set("accent_migrated_roxo", True)
        theme.set_theme(mode, accent_key, s.get_str("density") or None)

        self.setWindowIcon(QIcon(_brand_pixmap(64)))

        self._tabs: dict[str, QWidget] = {}
        self._nav_buttons: dict[str, NavButton] = {}
        self._current_tab: Optional[str] = None
        self._sidebar_compact = s.get_bool("sidebar_compact")

        central = QWidget()
        central.setObjectName("central")
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._sidebar_host = QFrame()
        self._sidebar_host.setObjectName("sidebar")
        self._sidebar_anim = QVariantAnimation(self)
        self._sidebar_anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._sidebar_anim.valueChanged.connect(self._set_sidebar_width)
        root.addWidget(self._sidebar_host)
        self._build_sidebar()

        right = QVBoxLayout()
        right.setContentsMargins(0, 0, 0, 0)
        right.setSpacing(0)
        right.addWidget(self._build_topbar())
        self.stack = QStackedWidget()
        right.addWidget(self.stack, 1)
        right.addWidget(self._build_statusbar())
        root.addLayout(right, 1)

        # Toast host cobre a janela inteira
        self.toast_host = ToastHost(central)
        services.toast_host = self.toast_host

        # bandeja do sistema (ações rápidas + continuar ativo ao fechar)
        self._really_quit = False
        self._tray = None
        self._build_tray()

        self._build_tabs()
        # largura inicial instantânea (sem animação) para a janela já abrir
        # no layout final — a animação fica apenas para o toggle do usuário
        self._set_sidebar_width(
            float(SIDEBAR_COMPACT if self._sidebar_compact else SIDEBAR_WIDE)
        )
        self.navigate("dashboard")

        # Conexões de monitoramento
        self.services.monitor.updated.connect(self._on_monitor_update)
        self.services.booster.state_changed.connect(self._on_boost_state)

        # Auto-detecção de jogos para boost automático
        self._autodetect_timer = QTimer(self)
        self._autodetect_timer.setInterval(5000)
        self._autodetect_timer.timeout.connect(self._auto_detect_game)
        if self.services.settings.get_bool("auto_detect_games"):
            self._autodetect_timer.start()

        self._install_shortcuts()
        self._apply_sidebar_style()
        self._mica_active = False
        theme.manager.changed.connect(self._apply_sidebar_style)
        theme.manager.changed.connect(self._retheme_chrome)
        theme.manager.changed.connect(self._apply_topbar_style)
        theme.manager.changed.connect(self._apply_statusbar_style)
        QTimer.singleShot(0, self._try_backdrop)

    # ------------------------------------------------------------- sidebar
    def _build_sidebar(self) -> None:
        bar = self._sidebar_host
        lay = QVBoxLayout(bar)
        lay.setContentsMargins(0, 12, 0, 12)
        lay.setSpacing(2)

        # cabeçalho: marca + nome + botão de recolher
        head = QHBoxLayout()
        head.setContentsMargins(14, 0, 10, 14)
        head.setSpacing(10)
        self._logo = QLabel()
        self._logo.setPixmap(_brand_pixmap(32))
        head.addWidget(self._logo)
        self._brand_col = QVBoxLayout()
        self._brand_col.setSpacing(0)
        app = ThemeLabel("DK", "label")
        sub = ThemeLabel("Otimizador", "accent")
        self._brand_col.addWidget(app)
        self._brand_col.addWidget(sub)
        head.addLayout(self._brand_col)
        head.addStretch(1)
        self.collapse_btn = QToolButton()
        self.collapse_btn.setIcon(icons.icon("panel_left", "muted", 16))
        self.collapse_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.collapse_btn.setToolTip("Recolher painel (Ctrl+B)")
        self.collapse_btn.setAccessibleName("Recolher painel de navegação")
        self.collapse_btn.clicked.connect(self.toggle_sidebar)
        head.addWidget(self.collapse_btn)
        lay.addLayout(head)

        # divisor neon sob a marca (cor do acento, gradiente discreto)
        self._accent_div = QFrame()
        self._accent_div.setFixedHeight(2)
        self._accent_div.setContentsMargins(14, 0, 14, 0)
        lay.addWidget(self._accent_div)

        current_group = 0
        for item_id, icon_name, label, group in NAV_ITEMS:
            if group != current_group:
                current_group = group
                gl = ThemeLabel(GROUP_LABELS[group], "caption")
                gl.setContentsMargins(18, 12, 0, 4)
                self._brand_col_wrapper = gl
                lay.addWidget(gl)
            btn = NavButton(item_id, icon_name, label)
            btn.clicked.connect(self.navigate)
            self._nav_buttons[item_id] = btn
            lay.addWidget(btn)
        lay.addStretch(1)

        # rodapé: estado do sistema (admin) + versão
        footer = QVBoxLayout()
        footer.setContentsMargins(14, 0, 14, 0)
        footer.setSpacing(2)
        self.admin_pill = ThemeLabel("", "caption")
        self.admin_pill.setWordWrap(True)
        footer.addWidget(self.admin_pill)
        self.version_lbl = ThemeLabel(f"v{__version__}", "caption")
        footer.addWidget(self.version_lbl)
        lay.addLayout(footer)
        self._update_admin_pill()

    def _apply_sidebar_style(self) -> None:
        acc = theme.ACCENT
        self._sidebar_host.setStyleSheet(
            f"#sidebar {{ background: {theme.SURFACE1};"
            f" border-right: 1px solid {theme.with_alpha(acc, 70)}; }}"
        )
        self._accent_div.setStyleSheet(
            f"background: qlineargradient(x1:0, y1:0, x2:1, y2:0,"
            f" stop:0 {theme.with_alpha(acc, 0)}, stop:0.35 {theme.with_alpha(acc, 200)},"
            f" stop:0.65 {theme.with_alpha(acc, 200)}, stop:1 {theme.with_alpha(acc, 0)});"
            "border: none; border-radius: 1px; margin-left: 14px; margin-right: 14px;"
        )
        self.collapse_btn.setStyleSheet(
            f"QToolButton {{ background: transparent; border: none; border-radius: 6px; padding: 4px; }}"
            f"QToolButton:hover {{ background: {theme.with_alpha(acc, 24)}; }}"
        )

    def _retheme_chrome(self) -> None:
        # re-tinta rótulos e ícones construídos com estilo fixo
        self._logo.setPixmap(_brand_pixmap(32))
        self.collapse_btn.setIcon(icons.icon("panel_left", "muted", 16))
        self._update_admin_pill()
        for btn in self._nav_buttons.values():
            btn.update()

    # ---- pausa da coleta quando a janela não está visível (economia de CPU)
    def hideEvent(self, event) -> None:
        self._set_monitor_paused(True)
        super().hideEvent(event)

    def showEvent(self, event) -> None:
        self._set_monitor_paused(False)
        super().showEvent(event)

    def changeEvent(self, event) -> None:
        if event.type() == QEvent.Type.WindowStateChange:
            self._set_monitor_paused(
                bool(self.windowState() & Qt.WindowState.WindowMinimized))
        super().changeEvent(event)

    def _set_monitor_paused(self, paused: bool) -> None:
        mon = getattr(self.services, "monitor", None)
        if mon is None:
            return
        if paused:
            mon.pause()
        else:
            mon.resume()

    def toggle_sidebar(self) -> None:
        self._sidebar_compact = not self._sidebar_compact
        self.services.settings.set("sidebar_compact", self._sidebar_compact)
        self._apply_sidebar_width()

    def _apply_sidebar_width(self) -> None:
        target = SIDEBAR_COMPACT if self._sidebar_compact else SIDEBAR_WIDE
        d = theme.dur("normal")
        if d <= 0:
            self._set_sidebar_width(float(target))
            return
        self._sidebar_anim.stop()
        self._sidebar_anim.setDuration(d)
        self._sidebar_anim.setStartValue(float(self._sidebar_host.width()))
        self._sidebar_anim.setEndValue(float(target))
        self._sidebar_anim.start()

    def _set_sidebar_width(self, w: float) -> None:
        self._sidebar_host.setFixedWidth(int(w))
        compact = self._sidebar_host.width() < (SIDEBAR_WIDE + SIDEBAR_COMPACT) / 2
        for lbl in self._sidebar_host.findChildren(QLabel):
            if lbl is not self.admin_pill and lbl is not self.version_lbl:
                lbl.setVisible(not compact)

    def _update_admin_pill(self) -> None:
        import sys

        if sys.platform != "win32":
            txt, color = "Modo de desenvolvimento (não-Windows)", theme.TEXT_FAINT
        elif elevation.is_admin():
            txt, color = "● Executando como administrador", theme.SUCCESS
        else:
            txt, color = "○ Sem privilégios de administrador", theme.WARNING
        self.admin_pill.setText(txt)
        self.admin_pill.setStyleSheet(
            f"color: {color}; font-size: 10px; font-weight: 600; background: transparent;"
        )
        self.admin_pill.setToolTip(
            "Recursos que exigem elevação pedirão confirmação do Windows (UAC)."
        )

    # -------------------------------------------------------------- topbar
    def _build_topbar(self) -> QWidget:
        bar = QFrame()
        bar.setObjectName("topbar")
        bar.setFixedHeight(72)
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(24, 0, 20, 0)
        lay.setSpacing(16)

        title_col = QVBoxLayout()
        title_col.setSpacing(1)
        self.page_title = ThemeLabel("Dashboard", "title")
        self.page_subtitle = ThemeLabel("Visão geral do desempenho", "body_sm")
        title_col.addWidget(self.page_title)
        title_col.addWidget(self.page_subtitle)
        lay.addLayout(title_col)
        lay.addStretch(1)

        self.boost_badge = QLabel("")
        self.boost_badge.setCursor(Qt.CursorShape.PointingHandCursor)
        self.boost_badge.setToolTip("Sessão de boost ativa — clique para ver o Game Booster")
        self.boost_badge.mousePressEvent = lambda e: self.navigate("booster")
        lay.addWidget(self.boost_badge)

        self.opt_btn = Button("Otimizar agora", "primary", "zap")
        self.opt_btn.setMinimumSize(180, 40)
        self.opt_btn.clicked.connect(self.optimize_requested.emit)
        lay.addWidget(self.opt_btn)
        self._apply_topbar_style()
        return bar

    def _apply_topbar_style(self) -> None:
        if getattr(self, "_mica_active", False):
            self.centralWidget().setStyleSheet(
                f"#central {{ background: {theme.with_alpha(theme.BG, 235)}; }}"
                f"#topbar {{ background: {theme.with_alpha(theme.SURFACE1, 225)};"
                f" border-bottom: 1px solid {theme.BORDER}; }}"
            )
        else:
            self.centralWidget().setStyleSheet(
                f"#central {{ background: {theme.BG}; }}"
                f"#topbar {{ background: {theme.SURFACE1};"
                f" border-bottom: 1px solid {theme.BORDER}; }}"
            )
        self._render_boost_badge()
        self._apply_statusbar_style()

    # ------------------------------------------------------------ statusbar
    def _build_statusbar(self) -> QWidget:
        bar = QFrame()
        bar.setObjectName("statusbar")
        bar.setFixedHeight(34)
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(20, 0, 20, 0)
        lay.setSpacing(18)
        self._status_labels: dict[str, QLabel] = {}
        for key, icon_name in (
            ("cpu", "cpu"), ("ram", "ram"), ("gpu", "gpu"), ("disk", "disk"),
            ("net", "activity"),
        ):
            row = QHBoxLayout()
            row.setSpacing(6)
            ic = QLabel()
            ic.setPixmap(icons.pixmap(icon_name, "faint", 13))
            lbl = QLabel("—")
            lbl.setStyleSheet(
                f"color: {theme.TEXT_MUTED}; font-size: 11px; font-weight: 600;"
                f"font-family: {theme.MONO_STACK}; background: transparent;"
            )
            row.addWidget(ic)
            row.addWidget(lbl)
            self._status_labels[key] = (ic, lbl)
            lay.addLayout(row)
        lay.addStretch(1)
        return bar

    def _apply_statusbar_style(self) -> None:
        bar = self.findChild(QFrame, "statusbar")
        if bar is not None:
            bar.setStyleSheet(
                f"#statusbar {{ background: {theme.SURFACE1}; border-top: 1px solid {theme.BORDER}; }}"
            )
        if not hasattr(self, "_status_labels"):
            return
        for key, (ic, lbl) in self._status_labels.items():
            icon_name = {"cpu": "cpu", "ram": "ram", "gpu": "gpu",
                         "disk": "disk", "net": "activity"}[key]
            ic.setPixmap(icons.pixmap(icon_name, "faint", 13))
            lbl.setStyleSheet(
                f"color: {theme.TEXT_MUTED}; font-size: 11px; font-weight: 600;"
                f"font-family: {theme.MONO_STACK}; background: transparent;"
            )

    def _try_backdrop(self) -> None:
        """Mica (Win11 22H2+) com fallback sólido elegante."""
        if self.services.settings.get_bool("disable_mica"):
            return
        if theme.try_enable_mica(self):
            self._mica_active = True
            self._apply_topbar_style()

    # ---------------------------------------------------------------- tabs
    def _build_tabs(self) -> None:
        # import tardio para evitar dependência circular
        from nexus.ui.tabs import cleanup, dashboard, fps, game_booster, hardware_monitor
        from nexus.ui.tabs import history as history_tab
        from nexus.ui.tabs import internet, library, pc_optimizer, processes, profiles
        from nexus.ui.tabs import settings_tab, startup

        builders = {
            "dashboard": dashboard.DashboardTab,
            "optimizer": pc_optimizer.PcOptimizerTab,
            "booster": game_booster.GameBoosterTab,
            "library": library.LibraryTab,
            "fps": fps.FpsTab,
            "hardware": hardware_monitor.HardwareMonitorTab,
            "cleanup": cleanup.CleanupTab,
            "internet": internet.InternetTab,
            "startup": startup.StartupTab,
            "processes": processes.ProcessesTab,
            "profiles": profiles.ProfilesTab,
            "history": history_tab.HistoryTab,
            "settings": settings_tab.SettingsTab,
        }
        for tab_id, builder in builders.items():
            tab = builder(self.services, self)
            self._tabs[tab_id] = tab
            self.stack.addWidget(tab)

    def navigate(self, tab_id: str) -> None:
        if tab_id not in self._tabs:
            return
        self._current_tab = tab_id
        for tid, btn in self._nav_buttons.items():
            btn.set_active(tid == tab_id)
        titles = {i[0]: i[2] for i in NAV_ITEMS}
        self.page_title.setText(titles.get(tab_id, ""))
        subtitles = {
            "dashboard": "Visão geral do desempenho do computador",
            "optimizer": "Ajustes seguros do Windows com explicação e reversão",
            "booster": "Otimize recursos antes de jogar e restaure depois",
            "library": "Seus jogos detectados automaticamente",
            "fps": "FPS e frametime reais durante os jogos (requer PresentMon)",
            "hardware": "Identificação e monitoramento do hardware",
            "cleanup": "Libere espaço com segurança — nada de arquivos pessoais",
            "internet": "Latência, velocidade e DNS medidos de verdade",
            "startup": "Controle os aplicativos que iniciam com o Windows",
            "processes": "Identifique e gerencie processos pesados",
            "profiles": "Perfis de otimização por jogo",
            "history": "Histórico de alterações com desfazer",
            "settings": "Preferências do aplicativo",
        }
        self.page_subtitle.setText(subtitles.get(tab_id, ""))
        self.stack.setCurrentWidget(self._tabs[tab_id])
        # transição suave entre abas (fade + deslocamento curto)
        from nexus.ui.components import page_transition

        page_transition(self._tabs[tab_id])

    # ------------------------------------------------------------- bandeja
    def _build_tray(self) -> None:
        if not QSystemTrayIcon.isSystemTrayAvailable():
            return
        self._tray = QSystemTrayIcon(QIcon(_brand_pixmap(64)), self)
        self._tray.setToolTip(f"DK v{__version__}")

        menu = QMenu()
        act_open = menu.addAction("Abrir DK")
        act_open.triggered.connect(self._show_from_tray)
        menu.addSeparator()
        act_opt = menu.addAction("Otimizar agora")
        act_opt.triggered.connect(self.optimize_requested.emit)
        self._tray_stop_act = menu.addAction("Encerrar sessão de boost")
        self._tray_stop_act.setEnabled(False)
        self._tray_stop_act.triggered.connect(self._tray_stop_boost)
        menu.addSeparator()
        act_quit = menu.addAction("Sair do DK")
        act_quit.triggered.connect(self._quit_from_tray)
        self._tray.setContextMenu(menu)
        self._tray.activated.connect(
            lambda reason: self._show_from_tray()
            if reason in (QSystemTrayIcon.ActivationReason.DoubleClick,
                          QSystemTrayIcon.ActivationReason.Trigger)
            else None
        )
        self._tray.show()

    def _show_from_tray(self) -> None:
        self.show()
        self.raise_()
        self.activateWindow()

    def _quit_from_tray(self) -> None:
        self._really_quit = True
        self.close()

    def _tray_stop_boost(self) -> None:
        from nexus.core.worker import run_task

        def job():
            return self.services.booster.stop()

        def done(res) -> None:
            ok, msg = res
            if self._tray is not None and self._tray.isVisible():
                self._tray.showMessage(
                    "DK", msg,
                    QSystemTrayIcon.MessageIcon.Information if ok
                    else QSystemTrayIcon.MessageIcon.Warning, 3000,
                )

        run_task(job, on_done=done)

    # ------------------------------------------------------------- atalhos
    def _install_shortcuts(self) -> None:
        for i, (tab_id, _icon, _label, _g) in enumerate(NAV_ITEMS[:9], start=1):
            sc = QShortcut(QKeySequence(f"Ctrl+{i}"), self)
            sc.activated.connect(lambda t=tab_id: self.navigate(t))
        QShortcut(QKeySequence("Ctrl+,"), self, activated=lambda: self.navigate("settings"))
        QShortcut(QKeySequence("Ctrl+B"), self, activated=self.toggle_sidebar)

    # -------------------------------------------------------- monitor route
    def _on_monitor_update(self, snap) -> None:
        labels = self._status_labels
        labels["cpu"][1].setText(f"CPU {snap.cpu_percent:.0f}%")
        labels["ram"][1].setText(f"RAM {snap.ram_percent:.0f}%")
        if snap.gpu and snap.gpu.utilization is not None:
            labels["gpu"][1].setText(f"GPU {snap.gpu.utilization:.0f}%")
        else:
            labels["gpu"][1].setText("GPU N/D")
        if snap.disks:
            labels["disk"][1].setText(f"Disco {snap.disks[0].percent:.0f}%")
        labels["net"][1].setText(f"↓{snap.net_down_mbs:.1f} ↑{snap.net_up_mbs:.1f} MB/s")

        # Roteia a atualização para a aba visível (gráficos ao vivo).
        tab = self._tabs.get(self._current_tab)
        if tab is not None:
            handler = getattr(tab, "on_monitor_update", None)
            if handler:
                try:
                    handler(snap)
                except Exception:  # noqa: BLE001
                    log.exception("falha ao atualizar aba %s", self._current_tab)

    def _on_boost_state(self, state) -> None:
        if state.active:
            game = state.game.name if state.game else "Boost rápido"
            self._boost_text = f"⚡ {game}"
        else:
            self._boost_text = ""
        self._render_boost_badge()
        act = getattr(self, "_tray_stop_act", None)
        if act is not None:
            act.setEnabled(state.active)
        if self._tray is not None:
            self._tray.setToolTip(
                f"DK v{__version__} — boost ativo" if state.active
                else f"DK v{__version__}"
            )

    def _render_boost_badge(self) -> None:
        text = getattr(self, "_boost_text", "")
        if not text:
            self.boost_badge.setText("")
            self.boost_badge.setVisible(False)
            return
        self.boost_badge.setVisible(True)
        self.boost_badge.setStyleSheet(
            f"color: {theme.ACCENT_TEXT}; background: {theme.with_alpha(theme.ACCENT, 26)};"
            f"border: 1px solid {theme.with_alpha(theme.ACCENT, 90)}; border-radius: 9px;"
            "padding: 3px 10px; font-size: 11px; font-weight: 700;"
        )
        self.boost_badge.setText(text)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self.toast_host.setGeometry(0, 0, self.centralWidget().width(), self.centralWidget().height())

    # ------------------------------------------------------------ autodetect
    def _auto_detect_game(self) -> None:
        """Detecta jogo em execução (em thread) sem travar a interface."""
        if getattr(self, "_detect_running", False):
            return
        self._detect_running = True

        def job():
            games = self.services.db.games_all()
            return self.services.booster.detect_running_game(games)

        def done(game) -> None:
            self._detect_running = False
            if game and not self.services.booster.state.active:
                if self.services.settings.get_bool("auto_boost"):
                    from nexus.core.worker import run_task

                    def start_job():
                        return self.services.booster.start(game)

                    def start_done(res) -> None:
                        ok, msg = res
                        if ok:
                            toast_for(
                                self,
                                f"Jogo detectado: {game.name}. Boost automático iniciado.",
                                "success",
                            )

                    run_task(start_job, on_done=start_done)
                else:
                    toast_for(self, f"Jogo detectado em execução: {game.name}", "info")

        def fail(_msg) -> None:
            self._detect_running = False

        from nexus.core.worker import run_task

        run_task(job, on_done=done, on_error=fail)

    # ---------------------------------------------------------------- close
    def closeEvent(self, event: QCloseEvent) -> None:
        # fechar para a bandeja (padrão) — o app continua monitorando
        if (not self._really_quit and self._tray is not None
                and self._tray.isVisible()
                and self.services.settings.get("minimize_to_tray") is not False):
            self.hide()
            if not self.services.settings.get_bool("tray_notice_shown"):
                self._tray.showMessage(
                    "DK",
                    "O aplicativo continua ativo na bandeja (ícone roxo). "
                    "Clique duas vezes para reabrir ou use o botão direito → Sair "
                    "para encerrar de vez.",
                    QSystemTrayIcon.MessageIcon.Information, 5000,
                )
                self.services.settings.set("tray_notice_shown", True)
            event.ignore()
            return

        if self.services.booster.state.active:
            from nexus.ui.components import confirm

            if not confirm(
                self,
                "Encerrar sessão de boost?",
                "Há uma sessão de boost ativa. Ao fechar, todas as configurações "
                "serão restauradas automaticamente.",
                confirm_text="Encerrar e sair",
            ):
                event.ignore()
                return
        # 1) Para a auto-detecção e a thread do monitor (sem novas emissões).
        self._autodetect_timer.stop()
        self.services.monitor.stop()
        # 2) Drena eventos em fila para widgets ainda vivos.
        QApplication.processEvents()
        # 3) Desconecta roteadores e encerra o restante dos serviços.
        try:
            self.services.monitor.updated.disconnect(self._on_monitor_update)
            self.services.monitor.hardware_ready.disconnect()
        except (TypeError, RuntimeError):
            pass
        theme.manager.changed.disconnect(self._apply_sidebar_style)
        theme.manager.changed.disconnect(self._retheme_chrome)
        if self._tray is not None:
            self._tray.hide()
        self.services.shutdown()
        super().closeEvent(event)
        QApplication.quit()
