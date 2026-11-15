"""Aba PC Optimizer: energia, efeitos visuais, serviços e fundo do Windows."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.optimization import power, services_win, visual_effects
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, SectionTitle, Spinner, ToggleSwitch, toast_for
from nexus.ui.tabs.base import BaseTab


class PcOptimizerTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._loading = False

        # -------------------------------------------------------- energia
        power_card = Card("Plano de energia", "zap")
        intro = QLabel(
            "Ativa o modo de alto desempenho do Windows. O plano anterior é salvo e "
            "pode ser restaurado no Histórico."
        )
        intro.setWordWrap(True)
        intro.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        power_card.body_layout().addWidget(intro)
        self.power_combo = QComboBox()
        self.power_combo.setMinimumWidth(320)
        self.power_refresh = QPushButton("")
        self.power_refresh.setIcon(icons.icon("refresh", "accent", 16))
        self.power_refresh.setToolTip("Recarregar planos")
        self.power_apply = QPushButton("Ativar plano selecionado")
        self.power_apply.setProperty("accent", True)
        row = QHBoxLayout()
        row.addWidget(self.power_combo, 1)
        row.addWidget(self.power_refresh)
        row.addWidget(self.power_apply)
        power_card.body_layout().addLayout(row)
        self.power_status = QLabel("")
        self.power_status.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        power_card.body_layout().addWidget(self.power_status)
        self.add(power_card)

        self.power_refresh.clicked.connect(self._load_power)
        self.power_apply.clicked.connect(self._apply_power)

        # ------------------------------------------------- efeitos visuais
        vfx_card = Card("Efeitos visuais do Windows", "windows")
        vintro = QLabel(
            "Ajustes leves e 100% reversíveis que reduzem trabalho da GPU/CPU na "
            "interface. Fontes e legibilidade são preservadas."
        )
        vintro.setWordWrap(True)
        vintro.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        vfx_card.body_layout().addWidget(vintro)
        self.vfx_toggles: dict[str, ToggleSwitch] = {}
        for tweak in visual_effects.TWEAKS:
            row = QFrame()
            row.setStyleSheet("background: transparent; border: none;")
            lay = QHBoxLayout(row)
            lay.setContentsMargins(0, 4, 0, 4)
            col = QVBoxLayout()
            name = QLabel(tweak.label)
            name.setStyleSheet(f"color: {theme.TEXT}; font-size: 13px; font-weight: 600;")
            desc = QLabel(tweak.description)
            desc.setWordWrap(True)
            desc.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
            col.addWidget(name)
            col.addWidget(desc)
            lay.addLayout(col, 1)
            tg = ToggleSwitch()
            tg.setToolTip("Aplicar este ajuste")
            self.vfx_toggles[tweak.id] = tg
            lay.addWidget(tg, 0, Qt.AlignmentFlag.AlignVCenter)
            vfx_card.body_layout().addWidget(row)
        vfx_btns = QHBoxLayout()
        self.vfx_apply = QPushButton("Aplicar ajustes selecionados")
        self.vfx_apply.setProperty("accent", True)
        self.vfx_restore = QPushButton("Restaurar tudo (desfazer)")
        self.vfx_restore.setProperty("danger", True)
        vfx_btns.addWidget(self.vfx_apply)
        vfx_btns.addWidget(self.vfx_restore)
        vfx_btns.addStretch(1)
        vfx_card.body_layout().addLayout(vfx_btns)
        self.add(vfx_card)

        self.vfx_apply.clicked.connect(self._apply_vfx)
        self.vfx_restore.clicked.connect(self._restore_vfx)

        # --------------------------------------------------------- serviços
        svc_card = Card("Serviços do Windows", "server")
        sintro = QLabel(
            "Apenas serviços catalogados como seguros podem ser ajustados. "
            "Windows Defender, Firewall, Windows Update e serviços essenciais são "
            "bloqueados e nunca exibidos como 'seguros'."
        )
        sintro.setWordWrap(True)
        sintro.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        svc_card.body_layout().addWidget(sintro)

        filter_row = QHBoxLayout()
        self.svc_filter = QLineEdit()
        self.svc_filter.setPlaceholderText("Filtrar serviços…")
        self.svc_only_safe = ToggleSwitch(False)
        only_safe_lbl = QLabel("Mostrar somente os seguros de ajustar")
        only_safe_lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        self.svc_refresh = QPushButton("Recarregar")
        filter_row.addWidget(self.svc_filter, 1)
        filter_row.addWidget(self.svc_only_safe)
        filter_row.addWidget(only_safe_lbl)
        filter_row.addWidget(self.svc_refresh)
        svc_card.body_layout().addLayout(filter_row)

        self.svc_table = QTableWidget(0, 5)
        self.svc_table.setHorizontalHeaderLabels(
            ["Serviço", "Status", "Inicialização", "Recomendação", "Ações"]
        )
        self.svc_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.svc_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.svc_table.verticalHeader().setVisible(False)
        self.svc_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.svc_table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.svc_table.setMinimumHeight(320)
        svc_card.body_layout().addWidget(self.svc_table)
        self.svc_detail = QLabel("Selecione um serviço para ver a descrição.")
        self.svc_detail.setWordWrap(True)
        self.svc_detail.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; background: {theme.PANEL};"
            "border-radius: 8px; padding: 8px;"
        )
        self.svc_detail.setMinimumHeight(40)
        svc_card.body_layout().addWidget(self.svc_detail)
        self.add(svc_card)

        self.svc_refresh.clicked.connect(self._load_services)
        self.svc_filter.textChanged.connect(self._render_services)
        self.svc_only_safe.toggled.connect(self._render_services)
        self.svc_table.currentCellChanged.connect(self._svc_selected)

        # ------------------------------------------- apps em segundo plano
        bg_card = Card("Aplicativos em segundo plano", "list")
        bgintro = QLabel(
            "Principais aplicativos consumindo recursos agora. Você pode suspendê-los "
            "(retomáveis depois) ou finalizá-los. Processos essenciais são protegidos."
        )
        bgintro.setWordWrap(True)
        bgintro.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        bg_card.body_layout().addWidget(bgintro)
        self.bg_refresh = QPushButton("Atualizar lista")
        self.bg_refresh.clicked.connect(self._load_bg)
        bg_card.body_layout().addWidget(self.bg_refresh)
        self.bg_list = QVBoxLayout()
        bg_card.body_layout().addLayout(self.bg_list)
        self.add(bg_card)

        self._load_power()
        self._load_vfx_states()
        self._load_services()
        self._load_bg()

    # ------------------------------------------------------------- energia
    def _load_power(self) -> None:
        def job():
            return power.list_plans()

        def done(plans) -> None:
            self.power_combo.clear()
            if not plans:
                self.power_combo.addItem("Indisponível neste sistema")
                self.power_status.setText("powercfg não respondeu.")
                return
            for p in plans:
                label = f"{p.name}{'  (ativo)' if p.active else ''}"
                self.power_combo.addItem(label, p.guid)
                if p.active:
                    self.power_combo.setCurrentIndex(self.power_combo.count() - 1)
            self.power_status.setText(
                "Plano ativo detectado. Selecione outro plano e clique em Ativar."
            )

        run_task(job, on_done=done)

    def _apply_power(self) -> None:
        idx = self.power_combo.currentIndex()
        guid = self.power_combo.itemData(idx) if idx >= 0 else None
        if not guid:
            toast_for(self, "Nenhum plano válido selecionado.", "warning")
            return

        def job():
            prev = power.current_plan()
            ok, msg = power.set_active(guid)
            if ok and prev:
                self.services.db.history_add(
                    "power", "Plano de energia alterado",
                    description="Plano alterado manualmente pelo PC Optimizer.",
                    undo={"previous_guid": prev.guid, "previous_name": prev.name},
                )
            return ok, msg

        def done(res) -> None:
            ok, out = res
            toast_for(self, "Plano de energia ativado." if ok
                      else "Falha ao ativar o plano (execute como administrador).",
                      "success" if ok else "error")
            self._load_power()

        run_task(job, on_done=done)

    # -------------------------------------------------------- efeitos
    def _load_vfx_states(self) -> None:
        def job():
            states = {}
            for t in visual_effects.TWEAKS:
                states[t.id] = visual_effects.is_applied(t)
            return states

        def done(states) -> None:
            for tid, applied in states.items():
                if tid in self.vfx_toggles:
                    self.vfx_toggles[tid].setChecked(bool(applied))

        def fail(_msg) -> None:
            for tg in self.vfx_toggles.values():
                tg.setEnabled(False)

        run_task(job, on_done=done, on_error=fail)

    def _apply_vfx(self) -> None:
        from nexus.ui.components import confirm

        if not confirm(
            self, "Aplicar efeitos visuais?",
            "Os ajustes selecionados serão aplicados ao registro (HKCU). "
            "Os valores atuais são salvos para reversão no Histórico.",
        ):
            return
        selected = [tid for tid, tg in self.vfx_toggles.items() if tg.isChecked()]

        def job():
            ok, msg, undo = visual_effects.apply_tweaks(selected)
            if ok:
                visual_effects.notify_explorer()
                self.services.db.history_add(
                    "visual", "Efeitos visuais ajustados", description=msg, undo=undo
                )
            return ok, msg

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")

        run_task(job, on_done=done)

    def _restore_vfx(self) -> None:
        from nexus.ui.components import confirm

        if not confirm(
            self, "Restaurar efeitos visuais",
            "Todos os ajustes visuais aplicados pelo Nexus Booster serão revertidos "
            "para os valores originais.", dangerous=True, confirm_text="Restaurar",
        ):
            return

        # Busca o payload de undo mais recente
        entries = self.services.db.history_list(limit=100, category="visual")
        payload = None
        for e in entries:
            if e.undo and not e.undone:
                payload = e.undo
                break

        def job():
            if not payload:
                # restaura padrões documentados do Windows
                visual_effects.restore({"tweaks": {t.id: t.on_default for t in visual_effects.TWEAKS}})
                return True, "Valores padrão do Windows restaurados."
            ok, msg = visual_effects.restore(payload)
            if ok and entries:
                self.services.db.history_mark_undone(entries[0].id)
            return ok, msg

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "warning")
            self._load_vfx_states()

        run_task(job, on_done=done)

    # ----------------------------------------------------------- serviços
    def _load_services(self) -> None:
        self.svc_table.setRowCount(0)

        def job():
            return services_win.enumerate_services()

        def done(svcs) -> None:
            if svcs is None:
                self._services = []
                self.svc_detail.setText(
                    "Serviços do Windows disponíveis somente no Windows."
                )
                return
            self._services = svcs
            self._render_services()

        run_task(job, on_done=done)

    def _render_services(self) -> None:
        text = self.svc_filter.text().lower()
        only_safe = self.svc_only_safe.isChecked()
        table = self.svc_table
        table.setRowCount(0)
        for svc in getattr(self, "_services", []):
            if text and text not in f"{svc.name} {svc.display_name}".lower():
                continue
            if only_safe and not svc.safe_to_disable:
                continue
            row = table.rowCount()
            table.insertRow(row)
            table.setItem(row, 0, QTableWidgetItem(f"{svc.display_name}\n{svc.name}"))
            status = QTableWidgetItem(svc.status_label)
            table.setItem(row, 1, status)
            table.setItem(row, 2, QTableWidgetItem(svc.start_label))
            rec = QTableWidgetItem("✔ seguro ajustar" if svc.safe_to_disable else "⚠ não recomendado")
            rec.setForeground(Qt.GlobalColor.green if svc.safe_to_disable else Qt.GlobalColor.yellow)
            table.setItem(row, 3, rec)

            actions = QWidget()
            al = QHBoxLayout(actions)
            al.setContentsMargins(4, 2, 4, 2)
            al.setSpacing(4)
            if svc.status == "running":
                stop_btn = QPushButton("Parar")
                stop_btn.setProperty("danger", True)
                stop_btn.clicked.connect(lambda _=False, n=svc.name: self._stop_service(n))
                al.addWidget(stop_btn)
            else:
                start_btn = QPushButton("Iniciar")
                start_btn.setProperty("success", True)
                start_btn.clicked.connect(lambda _=False, n=svc.name: self._start_service(n))
                al.addWidget(start_btn)
            combo = QComboBox()
            combo.addItem("Tipo…")
            combo.addItem("Automático", "auto")
            combo.addItem("Manual", "demand")
            combo.addItem("Desativado", "disabled")
            combo.currentIndexChanged.connect(
                lambda idx, n=svc.name, c=combo: self._svc_type_changed(n, c)
            )
            al.addWidget(combo)
            table.setCellWidget(row, 4, actions)
        table.resizeRowsToContents()

    def _svc_selected(self, row: int, *_args) -> None:
        if row < 0:
            return
        item = self.svc_table.item(row, 0)
        if not item:
            return
        name = item.text().split("\n")[-1]
        for svc in getattr(self, "_services", []):
            if svc.name == name:
                self.svc_detail.setText(f"{svc.reason} — {svc.description or 'sem descrição.'}")
                break

    def _stop_service(self, name: str) -> None:
        from nexus.ui.components import confirm

        if not confirm(self, "Parar serviço", f"Parar o serviço '{name}' agora?\n"
                        "Ele voltará na próxima inicialização (o tipo não muda).",
                        dangerous=True, confirm_text="Parar"):
            return

        def job():
            return services_win.stop_service(name)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load_services()

        run_task(job, on_done=done)

    def _start_service(self, name: str) -> None:
        def job():
            return services_win.start_service(name)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load_services()

        run_task(job, on_done=done)

    def _svc_type_changed(self, name: str, combo: QComboBox) -> None:
        idx = combo.currentIndex()
        if idx <= 0:
            return
        stype = combo.itemData(idx)
        combo.setCurrentIndex(0)
        from nexus.ui.components import confirm

        if not confirm(
            self, "Alterar inicialização do serviço",
            f"Alterar o tipo de inicialização de '{name}' para "
            f"'{combo.itemText(idx)}'?\nIsso pede elevação (UAC) e é reversível "
            "pelo Histórico.", dangerous=True, confirm_text="Alterar",
        ):
            return

        def job():
            ok, msg, undo = services_win.set_start_type(name, stype)
            if ok:
                self.services.db.history_add(
                    "service", f"Serviço '{name}' ajustado", description=msg, undo=undo
                )
            return ok, msg

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load_services()

        run_task(job, on_done=done)

    # -------------------------------------------------- segundo plano
    def _load_bg(self) -> None:
        # limpa lista
        while self.bg_list.count():
            item = self.bg_list.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        from nexus.system import processes as sys_processes

        def job():
            return sys_processes.top_consumers(n=8, by="cpu")

        def done(procs) -> None:
            if not procs:
                empty = QLabel("Nenhum processo consumindo recursos agora.")
                empty.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 12px;")
                self.bg_list.addWidget(empty)
                return
            from nexus.core import safety

            for p in procs:
                row = QFrame()
                row.setStyleSheet(
                    f"background: {theme.PANEL}; border: 1px solid {theme.BORDER}; border-radius: 8px;"
                )
                lay = QHBoxLayout(row)
                lay.setContentsMargins(12, 6, 12, 6)
                info = QLabel(f"{p.name}   ·   CPU {p.cpu:.0f}%   ·   RAM {p.mem_mb:.0f} MB")
                info.setStyleSheet(f"color: {theme.TEXT}; font-size: 12px;")
                lay.addWidget(info, 1)
                if not safety.is_protected_process(p.name):
                    suspend_btn = QPushButton("Suspender")
                    suspend_btn.clicked.connect(
                        lambda _=False, pid=p.pid, n=p.name: self._suspend_bg(pid, n)
                    )
                    lay.addWidget(suspend_btn)
                    kill_btn = QPushButton("Finalizar")
                    kill_btn.setProperty("danger", True)
                    kill_btn.clicked.connect(
                        lambda _=False, pid=p.pid, n=p.name: self._kill_bg(pid, n)
                    )
                    lay.addWidget(kill_btn)
                else:
                    prot = Pill("protegido", "muted")
                    lay.addWidget(prot)
                self.bg_list.addWidget(row)

        run_task(job, on_done=done)

    def _suspend_bg(self, pid: int, name: str) -> None:
        from nexus.system import processes as sys_processes

        ok, msg = sys_processes.suspend(pid, name)
        toast_for(self, msg, "success" if ok else "error")

    def _kill_bg(self, pid: int, name: str) -> None:
        from nexus.ui.components import confirm

        if not confirm(self, "Finalizar processo",
                       f"Finalizar '{name}'? Alterações não salvas serão perdidas.",
                       dangerous=True, confirm_text="Finalizar"):
            return
        from nexus.system import processes as sys_processes

        def job():
            return sys_processes.terminate(pid, name)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load_bg()

        run_task(job, on_done=done)
