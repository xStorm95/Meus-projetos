"""Aba Dashboard: status geral, medidores, gráficos em tempo real e ações rápidas."""

from __future__ import annotations

import time

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtWidgets import (
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from nexus.optimization import cleaner, startup as startup_mod
from nexus.ui import icons, theme
from nexus.ui.components import (
    Card,
    CoreBars,
    GaugeRing,
    KeyInfoRow,
    LineChart,
    Pill,
    StatTile,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class _IssueRow(QFrame):
    def __init__(self, icon_name: str, color: str, text: str, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background: transparent; border: none;")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 4, 0, 4)
        lay.setSpacing(8)
        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, color, 16))
        lay.addWidget(ic)
        lbl = QLabel(text)
        lbl.setWordWrap(True)
        lbl.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 12px; background: transparent;"
        )
        lay.addWidget(lbl, 1)


class ClickableTile(StatTile):
    """StatTile que navega para uma aba ao ser clicado."""

    def __init__(self, icon_name, label, value="—", sub="", tab_id="", services=None, parent=None):
        super().__init__(icon_name, label, value, sub, parent=parent)
        self.tab_id = tab_id
        self.services = services
        self._main_ref = None
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton and self.main is not None:
            self.main.navigate(self.tab_id)
        super().mousePressEvent(event)

    @property
    def main(self):
        return self._main_ref

    def set_main(self, main_window) -> None:
        self._main_ref = main_window


class DashboardTab(BaseTab):
    optimize_clicked = Signal()

    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)

        self.services.monitor.hardware_ready.connect(self._on_hardware_ready)

        # ---------------------------------------------------------- hero
        from nexus.ui.components import HeroCard

        hero = HeroCard("brand.jpg", "", "")
        hero_h = QHBoxLayout()
        hero_h.setSpacing(24)

        # anel de status geral
        self.score_ring = GaugeRing("Status geral", size=140, warn_at=101)
        hero_h.addWidget(self.score_ring)

        col = QVBoxLayout()
        col.setSpacing(4)
        title = QLabel("Desempenho do computador")
        title.setStyleSheet(f"color: {theme.TEXT}; font-size: 16px; font-weight: 800;")
        col.addWidget(title)
        self.hero_sub = QLabel("Detectando hardware…")
        self.hero_sub.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        self.hero_sub.setWordWrap(True)
        col.addWidget(self.hero_sub)
        self.issues_box = QVBoxLayout()
        self.issues_box.setSpacing(2)
        col.addLayout(self.issues_box)
        col.addStretch(1)
        hero_h.addLayout(col, 1)

        btn_col = QVBoxLayout()
        btn_col.setSpacing(8)
        opt_btn = QPushButton("  OTIMIZAR AGORA")
        opt_btn.setProperty("accent", True)
        opt_btn.setMinimumSize(200, 46)
        opt_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        opt_btn.setIcon(icons.icon("zap", "#04121f", 20))
        opt_btn.clicked.connect(self._emit_optimize)
        btn_col.addWidget(opt_btn)
        self.last_opt = QLabel("—")
        self.last_opt.setStyleSheet(
            f"color: {theme.TEXT_FAINT}; font-size: 11px; background: transparent;"
        )
        self.last_opt.setWordWrap(True)
        btn_col.addWidget(self.last_opt)
        hero_h.addLayout(btn_col)
        hero.body_layout().addLayout(hero_h)
        self.add(hero)

        self._refresh_last_opt()

        # ------------------------------------------------------- medidores
        gauges_row = QHBoxLayout()
        gauges_row.setSpacing(16)
        self.cpu_ring = GaugeRing("CPU")
        self.gpu_ring = GaugeRing("GPU", size=150)
        self.ram_ring = GaugeRing("RAM", size=150)
        self.disk_ring = GaugeRing("Disco (C:)", size=150)
        for ring in (self.cpu_ring, self.gpu_ring, self.ram_ring, self.disk_ring):
            gauges_row.addWidget(ring, 0, Qt.AlignmentFlag.AlignHCenter)

        temps = QVBoxLayout()
        temps.setSpacing(10)
        self.cpu_temp_tile = StatTile("thermometer", "Temp. CPU", "N/D", color="muted")
        self.gpu_temp_tile = StatTile("fan", "Temp. GPU", "N/D", color="muted")
        temps.addWidget(self.cpu_temp_tile)
        temps.addWidget(self.gpu_temp_tile)
        temps.addStretch(1)
        gauges_row.addLayout(temps)
        self.add_layout(gauges_row)

        # --------------------------------------------------------- gráficos
        charts = QGridLayout()
        charts.setSpacing(16)

        cpu_card = Card("CPU e RAM (%)", "activity")
        self.cpu_chart = LineChart(unit="%", fixed_max=100.0)
        self.cpu_chart.add_series("CPU", theme.ACCENT)
        self.cpu_chart.add_series("RAM", theme.SUCCESS)
        cpu_card.body_layout().addWidget(self.cpu_chart)
        charts.addWidget(cpu_card, 0, 0)

        gpu_card = Card("Uso de GPU", "gpu")
        self.gpu_chart = LineChart(unit="%", fixed_max=100.0)
        self.gpu_chart.add_series("GPU", "#a78bfa")
        gpu_card.body_layout().addWidget(self.gpu_chart)
        charts.addWidget(gpu_card, 0, 1)

        disk_card = Card("Disco — leitura/escrita (MB/s)", "disk")
        self.disk_chart = LineChart(unit="MB/s", fixed_max=None)
        self.disk_chart.add_series("Leitura", theme.ACCENT)
        self.disk_chart.add_series("Escrita", theme.SUCCESS)
        disk_card.body_layout().addWidget(self.disk_chart)
        charts.addWidget(disk_card, 1, 0)

        net_card = Card("Rede — download/upload (MB/s)", "globe")
        self.net_chart = LineChart(unit="MB/s", fixed_max=None)
        self.net_chart.add_series("Download", theme.ACCENT)
        self.net_chart.add_series("Upload", theme.SUCCESS)
        net_card.body_layout().addWidget(self.net_chart)
        charts.addWidget(net_card, 1, 1)

        self.add_layout(charts)

        # ------------------------------------------------------ núcleos CPU
        cores_card = Card("Carga por núcleo da CPU", "cpu")
        self.core_bars = CoreBars()
        cores_card.body_layout().addWidget(self.core_bars)
        self.add(cores_card)

        # -------------------------------------------------------- atalhos
        tiles = QHBoxLayout()
        tiles.setSpacing(16)
        self.games_tile = ClickableTile("gamepad", "Jogos detectados", "—", "clique p/ abrir", "library")
        self.startup_tile = ClickableTile("power", "Itens de inicialização", "—", "clique p/ gerenciar", "startup")
        self.clean_tile = ClickableTile("broom", "Espaço recuperável", "—", "última análise", "cleanup")
        self.history_tile = ClickableTile("history", "Ações registradas", "—", "histórico", "history")
        for tile in (self.games_tile, self.startup_tile, self.clean_tile, self.history_tile):
            tile.set_main(main_window)
            tiles.addWidget(tile)
        self.add_layout(tiles)

        # ------------------------------------------------------ hardware
        hw_card = Card("Identificação do hardware", "cpu")
        grid = QHBoxLayout()
        grid.setSpacing(24)
        col1 = QVBoxLayout()
        col2 = QVBoxLayout()
        grid.addLayout(col1)
        grid.addLayout(col2)
        hw_card.body_layout().addLayout(grid)
        col1.addWidget(KeyInfoRow("Processador", "Detectando…", "cpu"))
        col1.addWidget(KeyInfoRow("Núcleos", "—", "cpu"))
        col2.addWidget(KeyInfoRow("Placa de vídeo", "Detectando…", "gpu"))
        col2.addWidget(KeyInfoRow("Memória RAM", "—", "ram"))
        col1.addStretch(1)
        col2.addStretch(1)
        self.add(hw_card)
        self.hw_col1, self.hw_col2 = col1, col2

        QTimer.singleShot(300, self._refresh_quick_stats)

    # ------------------------------------------------------------ helpers
    def _emit_optimize(self) -> None:
        if self.main is not None:
            self.main.optimize_requested.emit()
        else:
            self.optimize_clicked.emit()

    def _go(self, tab_id: str) -> None:
        if self.main is not None:
            self.main.navigate(tab_id)

    def _refresh_last_opt(self) -> None:
        entry = self.services.db.last_optimization()
        if entry:
            t = time.strftime("%d/%m %H:%M", time.localtime(entry.ts))
            self.last_opt.setText(f"Última otimização: {t} — {entry.action}")
        else:
            self.last_opt.setText("Nenhuma otimização executada ainda.")

    def _refresh_quick_stats(self) -> None:
        from nexus.core.worker import run_task

        def job():
            games = self.services.db.games_all()
            try:
                items = startup_mod.enumerate_items()
            except Exception:
                items = []
            last_clean = self.services.settings.get("last_clean_analysis")
            history = self.services.db.history_list(limit=1000)
            return len(games), len(items), last_clean, len(history)

        def done(res) -> None:
            games_n, startup_n, last_clean, history_n = res
            self.games_tile.set_value(str(games_n), "clique p/ abrir")
            self.startup_tile.set_value(str(startup_n), "clique p/ gerenciar")
            if last_clean and isinstance(last_clean, dict):
                mb = last_clean.get("total_bytes", 0) / 1024**2
                when = time.strftime("%d/%m %H:%M", time.localtime(last_clean.get("ts", 0)))
                self.clean_tile.set_value(
                    f"{mb:.0f} MB" if mb < 1024 else f"{mb/1024:.1f} GB", f"análise de {when}"
                )
            else:
                self.clean_tile.set_value("—", "abra Limpeza Avançada")
            self.history_tile.set_value(str(history_n), "histórico completo")
            self._startup_count = startup_n
            self._update_issues()

        def fail(msg) -> None:
            self.games_tile.set_value("—", "indisponível")

        run_task(job, on_done=done, on_error=fail)

    def _on_hardware_ready(self, hw) -> None:
        ram_speeds = [f"{s.speed_mhz} MHz" for s in hw.ram_sticks if s.speed_mhz]
        ram_desc = f"{hw.ram_total_gb:.1f} GB" + (f" @ {ram_speeds[0]}" if ram_speeds else "")
        self.hero_sub.setText(
            f"{hw.cpu_name} · {hw.gpu_names[0] if hw.gpu_names else 'GPU não identificada'}"
            f" · {ram_desc} · {hw.os_name} ({hw.os_build})"
        )
        # Preenche o card de hardware
        while self.hw_col1.count():
            item = self.hw_col1.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        while self.hw_col2.count():
            item = self.hw_col2.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        c1 = [
            ("Processador", hw.cpu_name, "cpu"),
            ("Núcleos", f"{hw.cpu_cores_physical} físicos / {hw.cpu_cores_logical} lógicos", "cpu"),
            ("Frequência máx.", f"{hw.cpu_max_freq_mhz/1000:.2f} GHz" if hw.cpu_max_freq_mhz else "—", "zap"),
            ("Memória RAM", ram_desc, "ram"),
        ]
        sticks = "; ".join(
            f"{s.slot}: {s.size_gb} GB{f' {s.speed_mhz}MHz' if s.speed_mhz else ''}"
            for s in hw.ram_sticks
        ) or "detalhes não disponíveis"
        c2 = [
            ("Placa de vídeo", hw.gpu_names[0] if hw.gpu_names else "não identificada", "gpu"),
            ("Driver GPU", hw.gpu_driver or "—", "gpu"),
            ("Módulos de RAM", sticks, "ram"),
            ("Armazenamento", "; ".join(f"{d.model} ({d.size_gb:.0f} GB)" for d in hw.disks) or "—", "disk"),
        ]
        for label, value, ic in c1:
            self.hw_col1.addWidget(KeyInfoRow(label, value, ic))
        for label, value, ic in c2:
            self.hw_col2.addWidget(KeyInfoRow(label, value, ic))
        self.hw_col1.addStretch(1)
        self.hw_col2.addStretch(1)

    # ---------------------------------------------------------- ao vivo
    def on_monitor_update(self, snap) -> None:
        self.cpu_ring.set_value(snap.cpu_percent, f"{snap.cpu_freq_mhz:.0f} MHz" if snap.cpu_freq_mhz else "")
        if snap.gpu and snap.gpu.utilization is not None:
            self.gpu_ring.set_value(snap.gpu.utilization, snap.gpu.name[:22])
        else:
            self.gpu_ring.set_value(None, "uso não suportado")
        self.ram_ring.set_value(snap.ram_percent, f"{snap.ram_used_gb:.1f}/{snap.ram_total_gb:.0f} GB")
        if snap.disks:
            d = snap.disks[0]
            self.disk_ring.set_value(d.percent, f"{d.free_gb:.0f} GB livres")

        self.cpu_temp_tile.set_value(
            f"{snap.cpu_temp:.0f} °C" if snap.cpu_temp is not None else "N/D",
            "temperatura" if snap.cpu_temp is not None else "não suportado",
        )
        self.gpu_temp_tile.set_value(
            f"{snap.gpu_temp:.0f} °C" if snap.gpu_temp is not None else "N/D",
            "temperatura" if snap.gpu_temp is not None else "não suportado",
        )

        self.cpu_chart.push("CPU", snap.cpu_percent)
        self.cpu_chart.push("RAM", snap.ram_percent)
        self.gpu_chart.push("GPU", snap.gpu.utilization if snap.gpu and snap.gpu.utilization is not None else None)
        self.disk_chart.push("Leitura", snap.disk_read_mbs)
        self.disk_chart.push("Escrita", snap.disk_write_mbs)
        self.net_chart.push("Download", snap.net_down_mbs)
        self.net_chart.push("Upload", snap.net_up_mbs)
        self.core_bars.push(snap.cpu_per_core)

        self._last_snap = snap
        self._update_score()

    # ------------------------------------------------------------- score
    def _score(self) -> tuple[float, list[tuple[str, str, str]]]:
        snap = getattr(self, "_last_snap", None)
        issues: list[tuple[str, str, str]] = []
        if snap is None:
            return 0.0, issues
        parts: list[tuple[float, float]] = []  # (score, peso)

        parts.append((max(0.0, 100 - snap.cpu_percent), 2.5))
        parts.append((max(0.0, 100 - snap.ram_percent), 2.0))
        if snap.disks:
            d = snap.disks[0]
            parts.append((max(0.0, min(100.0, d.free_gb / d.total_gb * 200)), 1.5))
            if d.free_gb < 15:
                issues.append(("alert", "warning", f"Pouco espaço em {d.path} ({d.free_gb:.0f} GB livres)"))
        if snap.cpu_temp and snap.cpu_temp > 85:
            issues.append(("alert", "danger", f"Temperatura alta da CPU: {snap.cpu_temp:.0f} °C"))
            parts.append((40.0, 1.0))
        startup_n = getattr(self, "_startup_count", 0)
        if startup_n:
            st_score = max(0.0, 100 - max(0, startup_n - 8) * 6)
            parts.append((st_score, 1.0))
            if startup_n > 15:
                issues.append(("info", "info", f"{startup_n} itens de inicialização — considere desativar alguns"))
        if snap.ram_percent > 90:
            issues.append(("alert", "warning", f"Uso de RAM muito alto ({snap.ram_percent:.0f}%)"))
        if snap.cpu_percent > 85:
            issues.append(("alert", "warning", f"Uso de CPU muito alto ({snap.cpu_percent:.0f}%)"))

        total_w = sum(w for _, w in parts)
        score = sum(s * w for s, w in parts) / total_w if total_w else 0
        return score, issues

    def _update_score(self) -> None:
        score, issues = self._score()
        self.score_ring.set_value(score, "índice simplificado")
        # limpa issues antigas
        while self.issues_box.count():
            item = self.issues_box.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        if not issues:
            self.issues_box.addWidget(_IssueRow("check", "success", "Nenhum problema detectado no momento."))
        else:
            for icon_name, color, text in issues[:4]:
                color_key = color if color in ("accent", "success", "warning", "danger", "muted") else "accent"
                self.issues_box.addWidget(_IssueRow(icon_name, color_key, text))

    def _update_issues(self) -> None:
        self._update_score()
