"""Aba FPS Monitor: captura real via PresentMon, frametime, gargalos e comparações."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from nexus.core.worker import run_task
from nexus.games.profiles import get_profile
from nexus.system import fps_monitor as fpsmod
from nexus.system import processes as sys_processes
from nexus.ui import icons, theme
from nexus.ui.components import (
    Card,
    EmptyState,
    LineChart,
    Pill,
    StatTile,
    confirm,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class FpsTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._session: fpsmod.FpsSession | None = None
        self._cpu_samples: list[float] = []
        self._gpu_samples: list[float] = []

        # ---------------------------------------------------- fonte de dados
        src_card = Card("Fonte de dados de FPS", "activity")
        st = QLabel(
            "O FPS é medido com o PresentMon (ferramenta oficial da Intel/GPUOpen), "
            "que captura a apresentação real de quadros. O Nexus Booster não estima "
            "nem inventa valores: sem o PresentMon, o recurso fica marcado como "
            "não suportado."
        )
        st.setWordWrap(True)
        st.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        src_card.body_layout().addWidget(st)

        path_row = QHBoxLayout()
        self.pm_path = QLineEdit(self.services.settings.get_str("presentmon_path"))
        self.pm_path.setPlaceholderText(r"C:\Caminho\Para\PresentMon.exe")
        browse = QPushButton("Procurar…")
        browse.setIcon(icons.icon("folder", "accent", 16))
        browse.clicked.connect(self._browse_pm)
        save = QPushButton("Salvar")
        save.clicked.connect(self._save_pm_path)
        self.pm_status = Pill("verificando…", "muted")
        path_row.addWidget(self.pm_path, 1)
        path_row.addWidget(browse)
        path_row.addWidget(save)
        path_row.addWidget(self.pm_status)
        src_card.body_layout().addLayout(path_row)

        dl_row = QHBoxLayout()
        dl = QPushButton("  Abrir página de download do PresentMon")
        dl.setIcon(icons.icon("download", "accent", 16))
        dl.clicked.connect(self._open_pm_download)
        hint = QLabel(
            "Baixe a versão CLI (ex.: PresentMon-2.x-x64), extraia e aponte o caminho acima. "
            "Em algumas versões é necessário executar como administrador."
        )
        hint.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        hint.setWordWrap(True)
        dl_row.addWidget(dl)
        dl_row.addWidget(hint, 1)
        src_card.body_layout().addLayout(dl_row)
        self.add(src_card)
        self._check_pm()

        # ----------------------------------------------------------- sessão
        session_card = Card("Sessão de captura", "play")
        sel_row = QHBoxLayout()
        self.proc_combo = QComboBox()
        self.proc_combo.setMinimumWidth(280)
        self.refresh_proc = QPushButton("Atualizar lista")
        self.refresh_proc.clicked.connect(self._load_processes)
        self.start_btn = QPushButton("  Iniciar captura")
        self.start_btn.setProperty("accent", True)
        self.start_btn.setIcon(icons.icon("play", "#04121f", 16))
        self.stop_btn = QPushButton("  Parar")
        self.stop_btn.setProperty("danger", True)
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self._stop)
        self.start_btn.clicked.connect(self._start)
        sel_row.addWidget(QLabel("Processo do jogo:"))
        sel_row.addWidget(self.proc_combo, 1)
        sel_row.addWidget(self.refresh_proc)
        sel_row.addWidget(self.start_btn)
        sel_row.addWidget(self.stop_btn)
        session_card.body_layout().addLayout(sel_row)
        self.session_note = QLabel("Selecione o processo do jogo em execução.")
        self.session_note.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        session_card.body_layout().addWidget(self.session_note)
        self.add(session_card)

        # ------------------------------------------------------- estatísticas
        stats_row = QHBoxLayout()
        stats_row.setSpacing(14)
        self.fps_now = StatTile("activity", "FPS atual", "—", color="accent")
        self.fps_avg = StatTile("gauge", "FPS médio", "—", color="accent")
        self.fps_low = StatTile("alert", "FPS 1% low", "—", color="warning")
        self.ft_avg = StatTile("clock", "Frametime médio", "—", color="muted")
        for t in (self.fps_now, self.fps_avg, self.fps_low, self.ft_avg):
            stats_row.addWidget(t)
        self.add_layout(stats_row)

        # ----------------------------------------------------------- gráficos
        charts = QHBoxLayout()
        fps_chart_card = Card("FPS ao vivo", "activity")
        self.fps_chart = LineChart(unit="FPS", fixed_max=None, show_grid=True)
        self.fps_chart.add_series("FPS", theme.ACCENT)
        fps_chart_card.body_layout().addWidget(self.fps_chart)
        charts.addWidget(fps_chart_card)

        ft_chart_card = Card("Frametime (ms)", "clock")
        self.ft_chart = LineChart(unit="ms", fixed_max=None)
        self.ft_chart.add_series("Frametime", theme.WARNING)
        ft_chart_card.body_layout().addWidget(self.ft_chart)
        charts.addWidget(ft_chart_card)
        self.add_layout(charts)

        # -------------------------------------------------------- gargalos
        bn_card = Card("Análise de gargalo (heurística)", "cpu")
        bn_note = QLabel(
            "Durante a captura, comparamos o uso real de CPU e GPU. É uma heurística "
            "informativa — resultados variam por cena e configuração."
        )
        bn_note.setWordWrap(True)
        bn_note.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        bn_card.body_layout().addWidget(bn_note)
        self.bn_verdict = QLabel("Inicie uma captura para analisar.")
        self.bn_verdict.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 15px; font-weight: 800; background: transparent;"
        )
        bn_card.body_layout().addWidget(self.bn_verdict)
        self.cpu_chart = LineChart(unit="%", fixed_max=100.0)
        self.cpu_chart.add_series("CPU", theme.ACCENT)
        self.gpu_chart = LineChart(unit="%", fixed_max=100.0)
        self.gpu_chart.add_series("GPU", "#a78bfa")
        row = QHBoxLayout()
        row.addWidget(self.cpu_chart)
        row.addWidget(self.gpu_chart)
        bn_card.body_layout().addLayout(row)
        self.add(bn_card)

        # --------------------------------------------- antes x depois
        bench_card = Card("Comparação antes × depois", "history")
        bnote = QLabel(
            "Registre o resultado de uma sessão para comparar depois de otimizar. "
            "Somente sessões reais capturadas aparecem aqui."
        )
        bnote.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        bench_card.body_layout().addWidget(bnote)
        reg_row = QHBoxLayout()
        self.bench_game = QLineEdit()
        self.bench_game.setPlaceholderText("Nome do jogo (opcional)")
        reg_btn = QPushButton("Registrar resultado atual")
        reg_btn.clicked.connect(self._register_bench)
        reg_row.addWidget(self.bench_game, 1)
        reg_row.addWidget(reg_btn)
        bench_card.body_layout().addLayout(reg_row)

        self.bench_table = QTableWidget(0, 5)
        self.bench_table.setHorizontalHeaderLabels(
            ["Data", "Jogo", "FPS médio", "FPS 1% low", "Δ vs anterior"]
        )
        self.bench_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        self.bench_table.verticalHeader().setVisible(False)
        self.bench_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.bench_table.setMaximumHeight(220)
        bench_card.body_layout().addWidget(self.bench_table)
        self.add(bench_card)
        self._load_bench()
        self._load_processes()

    # ------------------------------------------------------------ PresentMon
    def _browse_pm(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Selecionar PresentMon.exe", "", "PresentMon (PresentMon*.exe;PresentMon.exe)"
        )
        if path:
            self.pm_path.setText(path)
            self._save_pm_path()

    def _save_pm_path(self) -> None:
        self.services.settings.set("presentmon_path", self.pm_path.text().strip())
        self._check_pm()

    def _check_pm(self) -> None:
        path = self.pm_path.text().strip()
        found = fpsmod.find_presentmon(path)
        if found:
            self.pm_status.setText("OK")
            self.pm_status.set_kind("success")
            self.pm_status.setToolTip(str(found))
        else:
            self.pm_status.setText("não configurado")
            self.pm_status.set_kind("danger")

    def _open_pm_download(self) -> None:
        from PySide6.QtGui import QDesktopServices
        from PySide6.QtCore import QUrl

        QDesktopServices.openUrl(QUrl("https://game-tech-dev.github.io/PresentMon/"))

    # --------------------------------------------------------------- sessão
    def _load_processes(self) -> None:
        def job():
            # processos conhecidos de jogos + processos com janela em execução
            procs = sys_processes.list_processes()
            games = self.services.db.games_all()
            known: set[str] = set()
            for g in games:
                prof = get_profile(g.profile_id)
                known.update(p.lower() for p in prof.process_names)
                if g.exe_path:
                    import os

                    known.add(os.path.basename(g.exe_path).lower())
            game_procs = [p for p in procs if p.exe and p.name.lower() in known]
            others = [p for p in procs if p.mem_mb > 150 and p.name.lower() not in known]
            return game_procs, others

        def done(res) -> None:
            game_procs, others = res
            self.proc_combo.clear()
            seen = set()
            for p in game_procs + others:
                if p.name.lower() in seen:
                    continue
                seen.add(p.name.lower())
                self.proc_combo.addItem(f"{p.name} (PID {p.pid})", (p.pid, p.name))
            if self.proc_combo.count() == 0:
                self.session_note.setText(
                    "Nenhum processo de jogo detectado — abra o jogo e atualize."
                )
            else:
                self.session_note.setText(
                    "Processos com maior consumo aparecem também. Alguns podem ser do sistema."
                )

        run_task(job, on_done=done)

    def _start(self) -> None:
        idx = self.proc_combo.currentIndex()
        if idx < 0:
            toast_for(self, "Selecione o processo do jogo.", "warning")
            return
        pid, name = self.proc_combo.itemData(idx)

        pm = fpsmod.find_presentmon(self.pm_path.text().strip())
        if not pm:
            toast_for(self, "Configure o caminho do PresentMon primeiro.", "error")
            return

        self._session = fpsmod.FpsSession(str(pm))
        self._session.updated.connect(self._on_fps_update)
        self._session.error.connect(self._on_fps_error)
        self._session.stopped.connect(self._on_fps_stopped)
        if self._session.start(pid=pid):
            self._cpu_samples.clear()
            self._gpu_samples.clear()
            self.fps_chart.clear()
            self.ft_chart.clear()
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self.bn_verdict.setText(f"Capturando '{name}'…")

    def _stop(self) -> None:
        if self._session:
            self._session.stop()
        self._finish_ui()

    def _finish_ui(self) -> None:
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)

    def _on_fps_error(self, msg: str) -> None:
        toast_for(self, msg, "error")
        self._finish_ui()

    def _on_fps_stopped(self, final: dict) -> None:
        self._finish_ui()
        if final.get("frames"):
            toast_for(
                self,
                f"Sessão finalizada: {final['frames']} quadros, média {final['avg']} FPS.",
                "success",
            )

    def _on_fps_update(self, stats: dict) -> None:
        self.fps_now.set_value(f"{stats['fps']:.0f}")
        self.fps_avg.set_value(f"{stats['avg']:.0f}")
        self.fps_low.set_value(f"{stats['low1']:.0f}")
        self.ft_avg.set_value(f"{stats['frametime_avg']:.1f} ms")
        self.fps_chart.push("FPS", stats["fps"])
        self.ft_chart.push("Frametime", stats["frametime"])

        # gargalo (heurística com dados reais do monitor)
        snap = self.services.monitor.latest
        if snap:
            self._cpu_samples.append(snap.cpu_percent)
            if snap.gpu and snap.gpu.utilization is not None:
                self._gpu_samples.append(snap.gpu.utilization)
            self.cpu_chart.push("CPU", snap.cpu_percent)
            self.gpu_chart.push("GPU", snap.gpu.utilization if snap.gpu else None)
            if len(self._cpu_samples) >= 15:
                cpu = sum(self._cpu_samples) / len(self._cpu_samples)
                gpu = (
                    sum(self._gpu_samples) / len(self._gpu_samples)
                    if self._gpu_samples else None
                )
                if gpu is None:
                    self.bn_verdict.setText(
                        f"CPU {cpu:.0f}% · uso de GPU não suportado nesta máquina."
                    )
                elif gpu >= 90 and gpu >= cpu:
                    self.bn_verdict.setText(
                        f"Provável gargalo de GPU (CPU {cpu:.0f}% · GPU {gpu:.0f}%) — "
                        "reduza opções pesadas no jogo."
                    )
                elif cpu >= 85 and cpu > gpu:
                    self.bn_verdict.setText(
                        f"Provável gargalo de CPU (CPU {cpu:.0f}% · GPU {gpu:.0f}%) — "
                        "feche apps em segundo plano / reduza física e multithreading."
                    )
                else:
                    self.bn_verdict.setText(
                        f"Sem gargalo claro (CPU {cpu:.0f}% · GPU {gpu:.0f}%)."
                    )

    # ------------------------------------------------------------- benchmarks
    def _register_bench(self) -> None:
        stats = self._session.stats.as_dict() if self._session else {}
        if not stats or stats.get("frames", 0) < 30:
            toast_for(
                self,
                "Capture pelo menos alguns segundos de jogo antes de registrar.",
                "warning",
            )
            return
        game = self.bench_game.text().strip() or "Sessão sem nome"
        self.services.db.bench_add(game, stats["avg"], stats["low1"], f"{stats['frames']} quadros")
        toast_for(self, "Resultado registrado para comparação.", "success")
        self._load_bench()

    def _load_bench(self) -> None:
        entries = self.services.db.bench_list(limit=20)
        t = self.bench_table
        t.setRowCount(0)
        prev_avg = None
        import time as _t

        for e in reversed(entries):  # mais antigo primeiro para delta
            row = t.rowCount()
            t.insertRow(row)
            t.setItem(row, 0, QTableWidgetItem(_t.strftime("%d/%m %H:%M", _t.localtime(e.ts))))
            t.setItem(row, 1, QTableWidgetItem(e.game_name))
            t.setItem(row, 2, QTableWidgetItem(f"{e.avg_fps:.0f}"))
            t.setItem(row, 3, QTableWidgetItem(f"{e.low_fps:.0f}"))
            if prev_avg:
                delta = e.avg_fps - prev_avg
                item = QTableWidgetItem(f"{delta:+.0f} FPS")
                item.setForeground(
                    Qt.GlobalColor.green if delta >= 0 else Qt.GlobalColor.red
                )
                t.setItem(row, 4, item)
            else:
                t.setItem(row, 4, QTableWidgetItem("—"))
            prev_avg = e.avg_fps
        t.resizeRowsToContents()

    def on_monitor_update(self, snap) -> None:
        # Mantém os gráficos de CPU/GPU da análise de gargalo ao vivo durante a sessão.
        if self._session is not None and self._session.running:
            pass  # atualizados em _on_fps_update
        else:
            self.cpu_chart.push("CPU", snap.cpu_percent)
            self.gpu_chart.push(
                "GPU", snap.gpu.utilization if snap.gpu and snap.gpu.utilization is not None else None
            )
