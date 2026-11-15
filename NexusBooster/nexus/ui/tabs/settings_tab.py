"""Aba Configurações: aparência, PresentMon, inicialização, dados e sobre."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
)

from nexus.constants import ACCENTS, APP_VERSION, PRESENTMON_URL
from nexus.core import elevation
from nexus.core.paths import app_data_dir
from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Card,
    Pill,
    SegmentedControl,
    Slider,
    ThemeLabel,
    ToggleSwitch,
    confirm,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class SettingsTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        s = services.settings

        # ------------------------------------------------------ aparência
        appearance = Card("Aparência", "settings")
        appearance.body_layout().addWidget(ThemeLabel("Tema", "label"))

        row_theme = QHBoxLayout()
        row_theme.setSpacing(theme.pad("md"))
        current_mode = s.get_str("theme_mode") or "dark"
        self.theme_seg = SegmentedControl(
            [("dark", "Escuro"), ("light", "Claro"), ("system", "Sistema")],
            current_mode,
        )
        row_theme.addWidget(self.theme_seg)
        row_theme.addStretch(1)
        appearance.body_layout().addLayout(row_theme)

        row_acc = QHBoxLayout()
        row_acc.setSpacing(theme.pad("md"))
        row_acc.addWidget(ThemeLabel("Cor de destaque:", "body"))
        self.accent_combo = QComboBox()
        for key, hexv in ACCENTS.items():
            self.accent_combo.addItem(key.upper(), key)
        self.accent_combo.setCurrentText(s.get_str("accent").upper())
        self.accent_combo.currentIndexChanged.connect(self._change_accent)
        row_acc.addWidget(self.accent_combo)
        row_acc.addStretch(1)
        appearance.body_layout().addLayout(row_acc)

        row_dens = QHBoxLayout()
        row_dens.setSpacing(theme.pad("md"))
        row_dens.addWidget(ThemeLabel("Densidade:", "body"))
        self.density_seg = SegmentedControl(
            [("comfortable", "Confortável"), ("compact", "Compacta")],
            s.get_str("density") or "comfortable",
        )
        row_dens.addWidget(self.density_seg)
        row_dens.addStretch(1)
        appearance.body_layout().addLayout(row_dens)
        self.add(appearance)

        self.theme_seg.changed.connect(self._change_theme)
        self.density_seg.changed.connect(self._change_density)

        # --------------------------------------------------- monitoramento
        mon = Card("Monitoramento", "activity")
        row_m = QHBoxLayout()
        row_m.setSpacing(theme.pad("md"))
        row_m.addWidget(ThemeLabel("Intervalo de atualização:", "body"))
        self.interval = Slider(Qt.Orientation.Horizontal)
        self.interval.setRange(500, 3000)
        self.interval.setSingleStep(250)
        self.interval.setValue(s.get_int("monitor_interval"))
        self.interval.setFixedWidth(220)
        self.interval_label = ThemeLabel(f"{self.interval.value()} ms", "body_sm")
        self.interval.valueChanged.connect(self._change_interval)
        row_m.addWidget(self.interval)
        row_m.addWidget(self.interval_label)
        row_m.addStretch(1)
        mon.body_layout().addLayout(row_m)
        mon.body_layout().addWidget(
            ThemeLabel("Define o equilíbrio entre fluidez dos gráficos e uso de CPU "
                       "do monitoramento.", "caption", wrap=True)
        )
        self.add(mon)

        # ------------------------------------------------- PresentMon (FPS)
        pm = Card("FPS — PresentMon", "activity")
        p1 = QHBoxLayout()
        self.pm_edit = QLineEdit(s.get_str("presentmon_path"))
        self.pm_edit.setPlaceholderText(r"C:\Caminho\Para\PresentMon.exe")
        browse = Button("Procurar…", "secondary", "folder")
        browse.clicked.connect(self._browse_pm)
        save = Button("Salvar", "secondary")
        save.clicked.connect(self._save_pm)
        p1.addWidget(self.pm_edit, 1)
        p1.addWidget(browse)
        p1.addWidget(save)
        pm.body_layout().addLayout(p1)
        p2 = QHBoxLayout()
        dl = Button("Abrir página oficial do PresentMon", "subtle", "download")
        dl.clicked.connect(lambda: QDesktopServices.openUrl(QUrl(PRESENTMON_URL)))
        note = ThemeLabel(
            "Necessário para medir FPS real. Sem ele, o FPS Monitor fica como "
            "'não suportado'.", "caption", wrap=True,
        )
        p2.addWidget(dl)
        p2.addWidget(note, 1)
        pm.body_layout().addLayout(p2)
        self.add(pm)

        # ---------------------------------------------------- Windows/admin
        win = Card("Windows e privilégios", "windows")
        w1 = QHBoxLayout()
        if sys.platform == "win32":
            if elevation.is_admin():
                w1.addWidget(Pill("Executando como administrador", "success"))
            else:
                w1.addWidget(Pill("Sem privilégios de administrador", "warning"))
                elevate_btn = Button("Reiniciar como administrador", "secondary")
                elevate_btn.clicked.connect(self._relaunch_admin)
                w1.addWidget(elevate_btn)
        else:
            w1.addWidget(
                ThemeLabel("Executando em ambiente de desenvolvimento (não-Windows).",
                           "body_sm")
            )
        w1.addStretch(1)
        win.body_layout().addLayout(w1)

        w2 = QHBoxLayout()
        self.autorun = ToggleSwitch(s.get_bool("launch_with_windows"))
        lbl = ThemeLabel("Iniciar o Nexus Booster com o Windows", "body")
        self.autorun.toggled.connect(self._toggle_autorun)
        w2.addWidget(self.autorun)
        w2.addWidget(lbl)
        w2.addStretch(1)
        win.body_layout().addLayout(w2)
        self.add(win)

        # ------------------------------------------------------------- dados
        data = Card("Dados do aplicativo", "folder")
        d1 = QHBoxLayout()
        path_lbl = ThemeLabel(str(app_data_dir()), "caption", wrap=True)
        open_btn = Button("Abrir pasta", "secondary", "folder")
        open_btn.clicked.connect(self._open_data)
        d1.addWidget(path_lbl, 1)
        d1.addWidget(open_btn)
        data.body_layout().addLayout(d1)

        danger_row = QHBoxLayout()
        reset = Button("Apagar histórico e configurações (reset)", "danger", "trash")
        reset.clicked.connect(self._reset_data)
        danger_row.addWidget(reset)
        danger_row.addStretch(1)
        data.body_layout().addLayout(danger_row)
        self.add(data)

        # ------------------------------------------------------------- sobre
        about = Card("Sobre", "info")
        a = ThemeLabel(
            f"<b>Nexus Booster</b> — v{APP_VERSION}<br><br>"
            "Otimizador de desempenho para Windows e jogos.<br>"
            "Monitoramento real via psutil/WMI · Persistência SQLite · "
            "Interface PySide6.<br><br>"
            f"<span style='color:{theme.TEXT_FAINT}'>Ajustes seguros, reversíveis e "
            "documentados. Nenhuma promessa de FPS garantido — métricas reais ou "
            "'não suportado'.</span>",
            "body_sm", wrap=True,
        )
        a.setTextFormat(Qt.TextFormat.RichText)
        about.body_layout().addWidget(a)
        self.add(about)

    # ------------------------------------------------------------- handlers
    def _change_theme(self, mode: str) -> None:
        self.services.settings.set("theme_mode", mode)
        effective = mode
        if mode == "system":
            effective = "dark" if theme.system_prefers_dark() else "light"
        theme.set_theme(effective, None, None)
        toast_for(self, f"Tema alterado para {mode}.", "success")

    def _change_accent(self) -> None:
        key = self.accent_combo.currentData()
        self.services.settings.set("accent", key)
        theme.set_theme(None, key, None)
        toast_for(self, f"Cor de destaque alterada para {key}.", "success")

    def _change_density(self, density: str) -> None:
        self.services.settings.set("density", density)
        theme.set_theme(None, None, density)
        toast_for(
            self,
            "Densidade alterada para " + ("compacta." if density == "compact"
                                          else "confortável."),
            "success",
        )

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
            sqlite3.connect(str(db_path())).executescript(
                "DROP TABLE IF EXISTS history; DROP TABLE IF EXISTS settings;"
                "DROP TABLE IF EXISTS games; DROP TABLE IF EXISTS game_sessions;"
                "DROP TABLE IF EXISTS error_log; DROP TABLE IF EXISTS benchmarks;"
            ).close()
            from nexus.core.database import Database

            self.services.db = Database(db_path)
            self.services.settings._db = self.services.db
            toast_for(self, "Dados apagados. Reinicie o aplicativo para recompor.",
                      "success")
        except Exception as exc:  # noqa: BLE001
            toast_for(self, f"Falha ao resetar: {exc}", "error")
