"""Janela principal: sidebar, barra superior, área de abas e barra de status."""

from __future__ import annotations

import logging
from typing import Optional

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QCloseEvent, QColor, QFont, QMouseEvent
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from nexus import __version__
from nexus.core import elevation
from nexus.ui import icons, theme
from nexus.ui.components import ToastHost, toast_for

log = logging.getLogger("nexus.ui.main")

# (id, ícone, rótulo, grupo)
NAV_ITEMS = [
    ("dashboard", "dashboard", "Dashboard", 1),
    ("optimizer", "gauge", "PC Optimizer", 1),
    ("booster", "rocket", "Game Booster", 1),
    ("library", "gamepad", "Biblioteca de Jogos", 1),
    ("fps", "activity", "FPS Monitor", 1),
    ("hardware", "cpu", "Hardware Monitor", 1),
    ("cleanup", "broom", "Limpeza Avançada", 2),
    ("internet", "globe", "Internet Boost", 2),
    ("startup", "power", "Inicialização", 2),
    ("processes", "list", "Processos", 2),
    ("profiles", "sliders", "Perfis", 3),
    ("history", "history", "Histórico", 3),
    ("settings", "settings", "Configurações", 3),
]

GROUP_LABELS = {1: "Geral", 2: "Ferramentas", 3: "Sistema"}


class SidebarButton(QFrame):
    """Botão de navegação com indicador lateral animado."""

    clicked = Signal(str)

    def __init__(self, item_id: str, icon_name: str, label: str, parent=None):
        super().__init__(parent)
        self._id = item_id
        self._active = False
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(38)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 0, 10, 0)
        lay.setSpacing(10)
        self._icon = QLabel()
        self._icon.setPixmap(icons.pixmap(icon_name, "muted", 18))
        self._label = QLabel(label)
        self._label.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 13px; font-weight: 600; background: transparent;"
        )
        lay.addWidget(self._icon)
        lay.addWidget(self._label)
        lay.addStretch(1)

    def set_active(self, active: bool) -> None:
        self._active = active
        icon_name = dict((i[0], i[1]) for i in NAV_ITEMS)[self._id]
        if active:
            self._icon.setPixmap(icons.pixmap(icon_name, "accent", 18))
            self._label.setStyleSheet(
                f"color: {theme.TEXT}; font-size: 13px; font-weight: 700; background: transparent;"
            )
            self.setStyleSheet(
                f"""
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {theme.ACCENT}22, stop:1 transparent);
                border-left: 3px solid {theme.ACCENT};
                border-top-right-radius: 8px; border-bottom-right-radius: 8px;
                """
            )
        else:
            self._icon.setPixmap(icons.pixmap(icon_name, "muted", 18))
            self._label.setStyleSheet(
                f"color: {theme.TEXT_MUTED}; font-size: 13px; font-weight: 600; background: transparent;"
            )
            self.setStyleSheet("background: transparent; border-left: 3px solid transparent;")

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.clicked.emit(self._id)
        else:
            super().mousePressEvent(event)

    def enterEvent(self, event) -> None:
        if not self._active:
            self.setStyleSheet(
                f"""
                background: {theme.CARD}; border-left: 3px solid transparent;
                border-top-right-radius: 8px; border-bottom-right-radius: 8px;
                """
            )
        super().enterEvent(event)

    def leaveEvent(self, event) -> None:
        if not self._active:
            self.setStyleSheet("background: transparent; border-left: 3px solid transparent;")
        super().leaveEvent(event)


class MainWindow(QMainWindow):
    optimize_requested = Signal()

    def __init__(self, services):
        super().__init__()
        self.services = services
        self.setWindowTitle(f"Nexus Booster — Otimizador de Desempenho {__version__}")
        self.setMinimumSize(1180, 720)
        self.resize(1360, 820)

        self._tabs: dict[str, QWidget] = {}
        self._nav_buttons: dict[str, SidebarButton] = {}
        self._current_tab: Optional[str] = None

        central = QWidget()
        central.setStyleSheet(f"background: {theme.BG};")
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(self._build_sidebar())

        right = QVBoxLayout()
        right.setContentsMargins(0, 0, 0, 0)
        right.setSpacing(0)
        right.addWidget(self._build_topbar())
        self.stack = QStackedWidget()
        self.stack.setStyleSheet(f"background: {theme.BG};")
        right.addWidget(self.stack, 1)
        right.addWidget(self._build_statusbar())
        root.addLayout(right, 1)

        # Toast host cobre a janela inteira
        self.toast_host = ToastHost(central)
        services.toast_host = self.toast_host

        self._build_tabs()
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

    # ------------------------------------------------------------- sidebar
    def _build_sidebar(self) -> QWidget:
        bar = QFrame()
        bar.setFixedWidth(232)
        bar.setStyleSheet(
            f"""
            QFrame {{
                background: {theme.PANEL};
                border-right: 1px solid {theme.BORDER};
            }}
            """
        )
        lay = QVBoxLayout(bar)
        lay.setContentsMargins(0, 18, 0, 14)
        lay.setSpacing(2)

        # logo
        logo_row = QHBoxLayout()
        logo_row.setContentsMargins(16, 0, 16, 18)
        logo_icon = QLabel()
        logo_icon.setPixmap(icons.pixmap("bolt_filled", "accent", 30))
        logo_row.addWidget(logo_icon)
        name_col = QVBoxLayout()
        name_col.setSpacing(0)
        app = QLabel("NEXUS")
        app.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 16px; font-weight: 900; letter-spacing: 2px; background: transparent;"
        )
        sub = QLabel("BOOSTER")
        sub.setStyleSheet(
            f"color: {theme.ACCENT}; font-size: 16px; font-weight: 900; letter-spacing: 3px; background: transparent;"
        )
        name_col.addWidget(app)
        name_col.addWidget(sub)
        logo_row.addLayout(name_col)
        logo_row.addStretch(1)
        lay.addLayout(logo_row)

        current_group = 0
        for item_id, icon_name, label, group in NAV_ITEMS:
            if group != current_group:
                current_group = group
                gl = QLabel(GROUP_LABELS[group])
                gl.setStyleSheet(
                    f"color: {theme.TEXT_FAINT}; font-size: 10px; font-weight: 700;"
                    f"letter-spacing: 1.5px; background: transparent;"
                )
                gl.setContentsMargins(18, 12, 0, 4)
                lay.addWidget(gl)
            btn = SidebarButton(item_id, icon_name, label)
            btn.clicked.connect(self.navigate)
            self._nav_buttons[item_id] = btn
            lay.addWidget(btn)
        lay.addStretch(1)

        # rodapé: admin + versão
        footer = QVBoxLayout()
        footer.setContentsMargins(16, 0, 16, 0)
        self.admin_pill = QLabel()
        footer.addWidget(self.admin_pill)
        ver = QLabel(f"v{__version__}")
        ver.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 10px; background: transparent;")
        footer.addWidget(ver)
        lay.addLayout(footer)
        self._update_admin_pill()
        return bar

    def _update_admin_pill(self) -> None:
        import sys

        if sys.platform != "win32":
            txt, color = "MODO DESENVOLVIMENTO (não-Windows)", theme.TEXT_FAINT
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
        bar.setFixedHeight(74)
        bar.setStyleSheet(
            f"""
            QFrame {{
                background: {theme.PANEL};
                border-bottom: 1px solid {theme.BORDER};
            }}
            """
        )
        lay = QHBoxLayout(bar)
        lay.setContentsMargins(24, 0, 20, 0)
        lay.setSpacing(16)

        title_col = QVBoxLayout()
        title_col.setSpacing(0)
        self.page_title = QLabel("Dashboard")
        self.page_title.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 17px; font-weight: 800; background: transparent;"
        )
        self.page_subtitle = QLabel("Visão geral do desempenho")
        self.page_subtitle.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; background: transparent;"
        )
        title_col.addWidget(self.page_title)
        title_col.addWidget(self.page_subtitle)
        lay.addLayout(title_col)
        lay.addStretch(1)

        self.opt_btn = QPushButton("  OTIMIZAR AGORA")
        self.opt_btn.setProperty("accent", True)
        self.opt_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.opt_btn.setIcon(icons.icon("zap", "#04121f", 18))
        self.opt_btn.clicked.connect(self.optimize_requested.emit)
        lay.addWidget(self.opt_btn)
        return bar

    # ------------------------------------------------------------ statusbar
    def _build_statusbar(self) -> QWidget:
        bar = QFrame()
        bar.setFixedHeight(40)
        bar.setStyleSheet(
            f"""
            QFrame {{
                background: {theme.PANEL};
                border-top: 1px solid {theme.BORDER};
            }}
            """
        )
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
            ic.setPixmap(icons.pixmap(icon_name, "muted", 14))
            lbl = QLabel("—")
            lbl.setStyleSheet(
                f"color: {theme.TEXT_MUTED}; font-size: 11px; font-weight: 600; background: transparent;"
            )
            row.addWidget(ic)
            row.addWidget(lbl)
            self._status_labels[key] = lbl
            lay.addLayout(row)
        lay.addStretch(1)
        self.boost_label = QLabel("")
        self.boost_label.setStyleSheet(
            f"color: {theme.ACCENT}; font-size: 11px; font-weight: 700; background: transparent;"
        )
        lay.addWidget(self.boost_label)
        return bar

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

    # -------------------------------------------------------- monitor route
    def _on_monitor_update(self, snap) -> None:
        labels = self._status_labels
        labels["cpu"].setText(f"CPU {snap.cpu_percent:.0f}%")
        labels["ram"].setText(f"RAM {snap.ram_percent:.0f}%")
        if snap.gpu and snap.gpu.utilization is not None:
            labels["gpu"].setText(f"GPU {snap.gpu.utilization:.0f}%")
        elif snap.gpu:
            labels["gpu"].setText("GPU N/D")
        else:
            labels["gpu"].setText("GPU N/D")
        if snap.disks:
            labels["disk"].setText(f"Disco {snap.disks[0].percent:.0f}%")
        labels["net"].setText(
            f"↓{snap.net_down_mbs:.1f} ↑{snap.net_up_mbs:.1f} MB/s"
        )

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
            self.boost_label.setText(f"⚡ BOOST ATIVO — {game}")
        else:
            self.boost_label.setText("")

    # ------------------------------------------------------------ autodetect
    def _auto_detect_game(self) -> None:
        """Detecta jogo em execução e inicia boost automático (se ativado)."""
        try:
            from nexus.games.profiles import get_profile

            games = self.services.db.games_all()
            game = self.services.booster.detect_running_game(games)
            if game and not self.services.booster.state.active:
                if self.services.settings.get_bool("auto_boost"):
                    ok, msg = self.services.booster.start(game)
                    if ok:
                        toast_for(
                            self,
                            f"Jogo detectado: {game.name}. Boost automático iniciado.",
                            "success",
                        )
                else:
                    toast_for(self, f"Jogo detectado em execução: {game.name}", "info")
        except Exception:  # noqa: BLE001
            log.exception("auto-detecção de jogos falhou")

    # ---------------------------------------------------------------- close
    def closeEvent(self, event: QCloseEvent) -> None:
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
        self.services.shutdown()
        super().closeEvent(event)
        QApplication.quit()
