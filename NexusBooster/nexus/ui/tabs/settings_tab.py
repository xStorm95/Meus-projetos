"""Aba Configurações: preferências, PresentMon, inicialização, dados e sobre."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt, QTimer, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QSlider,
    QVBoxLayout,
)

from nexus.constants import ACCENTS, APP_VERSION, PRESENTMON_URL
from nexus.core import elevation
from nexus.core.paths import app_data_dir
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, ToggleSwitch, confirm, toast_for
from nexus.ui.tabs.base import BaseTab


class SettingsTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        s = services.settings

        # ------------------------------------------------------------ geral
        general = Card("Geral", "settings")
        r1 = QHBoxLayout()
        r1.addWidget(QLabel("Cor de destaque:"))
        self.accent_combo = QComboBox()
        for key, hexv in ACCENTS.items():
            self.accent_combo.addItem(key.upper(), key)
        self.accent_combo.setCurrentText(s.get_str("accent").upper())
        self.accent_combo.currentIndexChanged.connect(self._change_accent)
        r1.addWidget(self.accent_combo)
        r1.addStretch(1)
        general.body_layout().addLayout(r1)

        r2 = QHBoxLayout()
        r2.addWidget(QLabel("Intervalo de monitoramento:"))
        self.interval = QSlider(Qt.Orientation.Horizontal)
        self.interval.setRange(500, 3000)
        self.interval.setSingleStep(250)
        self.interval.setValue(s.get_int("monitor_interval"))
        self.interval.setFixedWidth(220)
        self.interval_label = QLabel(f"{self.interval.value()} ms")
        self.interval.valueChanged.connect(self._change_interval)
        r2.addWidget(self.interval)
        r2.addWidget(self.interval_label)
        r2.addStretch(1)
        general.body_layout().addLayout(r2)
        self.add(general)

        # ------------------------------------------------- PresentMon (FPS)
        pm = Card("FPS — PresentMon", "activity")
        p1 = QHBoxLayout()
        self.pm_edit = QLineEdit(s.get_str("presentmon_path"))
        self.pm_edit.setPlaceholderText(r"C:\Caminho\Para\PresentMon.exe")
        browse = QPushButton("Procurar…")
        browse.clicked.connect(self._browse_pm)
        save = QPushButton("Salvar")
        save.clicked.connect(self._save_pm)
        p1.addWidget(self.pm_edit, 1)
        p1.addWidget(browse)
        p1.addWidget(save)
        pm.body_layout().addLayout(p1)
        p2 = QHBoxLayout()
        dl = QPushButton("  Abrir página oficial do PresentMon")
        dl.setIcon(icons.icon("download", "accent", 16))
        dl.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(PRESENTMON_URL)))
        note = QLabel("Necessário para medir FPS real. Sem ele, o FPS Monitor fica como 'não suportado'.")
        note.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        note.setWordWrap(True)
        p2.addWidget(dl)
        p2.addWidget(note, 1)
        pm.body_layout().addLayout(p2)
        self.add(pm)

        # ---------------------------------------------------- Windows/admin
        win = Card("Windows e privilégios", "windows")
        w1 = QHBoxLayout()
        if sys.platform == "win32":
            if elevation.is_admin():
                badge = Pill("Executando como administrador", "success")
                w1.addWidget(badge)
            else:
                badge = Pill("Sem privilégios de administrador", "warning")
                w1.addWidget(badge)
                elevate_btn = QPushButton("Reiniciar como administrador")
                elevate_btn.clicked.connect(self._relaunch_admin)
                w1.addWidget(elevate_btn)
        else:
            w1.addWidget(QLabel("Executando em ambiente de desenvolvimento (não-Windows)."))
        w1.addStretch(1)
        win.body_layout().addLayout(w1)

        w2 = QHBoxLayout()
        self.autorun = ToggleSwitch(s.get_bool("launch_with_windows"))
        lbl = QLabel("Iniciar o Nexus Booster com o Windows")
        lbl.setStyleSheet(f"color: {theme.TEXT}; font-size: 13px;")
        self.autorun.toggled.connect(self._toggle_autorun)
        w2.addWidget(self.autorun)
        w2.addWidget(lbl)
        w2.addStretch(1)
        win.body_layout().addLayout(w2)
        self.add(win)

        # ------------------------------------------------------------- dados
        data = Card("Dados do aplicativo", "folder")
        d1 = QHBoxLayout()
        path_lbl = QLabel(str(app_data_dir()))
        path_lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
        open_btn = QPushButton("Abrir pasta")
        open_btn.clicked.connect(self._open_data)
        d1.addWidget(path_lbl, 1)
        d1.addWidget(open_btn)
        data.body_layout().addLayout(d1)

        danger_row = QHBoxLayout()
        reset = QPushButton("Apagar histórico e configurações (reset)")
        reset.setProperty("danger", True)
        reset.clicked.connect(self._reset_data)
        danger_row.addWidget(reset)
        danger_row.addStretch(1)
        data.body_layout().addLayout(danger_row)
        self.add(data)

        # ------------------------------------------------------------- sobre
        about = Card("Sobre", "info")
        a = QLabel(
            f"<b>Nexus Booster</b> — v{APP_VERSION}<br><br>"
            "Otimizador de desempenho para Windows e jogos.<br>"
            "Monitoramento real via psutil/WMI · Persistência SQLite · "
            "Interface PySide6.<br><br>"
            "<span style='color:{theme.TEXT_FAINT}'>Ajustes seguros, reversíveis e "
            "documentados. Nenhuma promessa de FPS garantido — métricas reais ou "
            "'não suportado'.</span>"
        )
        a.setTextFormat(Qt.TextFormat.RichText)
        a.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        about.body_layout().addWidget(a)
        self.add(about)

    # ------------------------------------------------------------- handlers
    def _change_accent(self) -> None:
        key = self.accent_combo.currentData()
        self.services.settings.set("accent", key)
        from PySide6.QtWidgets import QApplication

        from nexus.ui.theme import apply_theme

        apply_theme(QApplication.instance(), key)
        toast_for(self, f"Tema alterado para {key}.", "success")

    def _change_interval(self, value: int) -> None:
        self.interval_label.setText(f"{value} ms")
        self.services.settings.set("monitor_interval", value)
        self.services.monitor.set_interval(value)

    def _browse_pm(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Selecionar PresentMon.exe", "",
                                              "PresentMon (*.exe)")
        if path:
            self.pm_edit.setText(path)
            self._save_pm()

    def _save_pm(self) -> None:
        self.services.settings.set("presentmon_path", self.pm_edit.text().strip())
        toast_for(self, "Caminho do PresentMon salvo.", "success")

    def _relaunch_admin(self) -> None:
        if confirm(self, "Reiniciar como administrador",
                   "O Nexus Booster será fechado e reaberto com privilégios de "
                   "administrador (UAC).", confirm_text="Reiniciar"):
            if elevation.relaunch_as_admin():
                self.window().close()
            else:
                toast_for(self, "Não foi possível elevar (UAC recusado?).", "error")

    def _toggle_autorun(self, on: bool) -> None:
        from nexus.system import registry_utils as reg

        self.services.settings.set("launch_with_windows", on)
        if sys.platform != "win32":
            toast_for(self, "Opção aplicável apenas no Windows.", "warning")
            return
        run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
        name = "NexusBooster"
        if on:
            from nexus.core.paths import exe_path

            if reg.write("HKCU", run_key, name, f'"{exe_path()}"'):
                toast_for(self, "O Nexus Booster iniciará com o Windows.", "success")
            else:
                toast_for(self, "Falha ao registrar a inicialização.", "error")
        else:
            reg.delete_value("HKCU", run_key, name)
            toast_for(self, "Inicialização automática removida.", "info")

    def _open_data(self) -> None:
        from nexus.core.paths import app_data_dir

        if sys.platform == "win32":
            import os

            os.startfile(str(app_data_dir()))
        else:
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(app_data_dir())))

    def _reset_data(self) -> None:
        if not confirm(
            self, "Apagar dados do aplicativo",
            "Todo o histórico, jogos detectados e preferências serão apagados "
            "(o banco é recriado). Os arquivos do sistema NÃO são tocados.",
            dangerous=True, confirm_text="Apagar tudo",
        ):
            return
        import sqlite3

        from nexus.core.paths import db_path

        try:
            self.services.db.close()
            sqlite3.connect(str(db_path)).executescript(
                "DROP TABLE IF EXISTS history; DROP TABLE IF EXISTS settings;"
                "DROP TABLE IF EXISTS games; DROP TABLE IF EXISTS game_sessions;"
                "DROP TABLE IF EXISTS error_log; DROP TABLE IF EXISTS benchmarks;"
            ).close()
            from nexus.core.database import Database

            self.services.db = Database(db_path)
            self.services.settings._db = self.services.db
            toast_for(self, "Dados apagados. Reinicie o aplicativo para recompor.", "success")
        except Exception as exc:  # noqa: BLE001
            toast_for(self, f"Falha ao resetar: {exc}", "error")
