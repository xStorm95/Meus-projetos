"""Aba PC Optimizer: energia, efeitos visuais, serviços e fundo do Windows."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.optimization import power, services_win, visual_effects
from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Card,
    Pill,
    SearchBox,
    SectionTitle,
    Spinner,
    ThemeLabel,
    ToggleSwitch,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class _ToggleRow(QFrame):
    """Linha de configuração: nome + descrição + toggle (Win11 style)."""

    def __init__(self, title: str, description: str, checked: bool = False, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background: transparent; border: none;")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, theme.pad("sm"), 0, theme.pad("sm"))
        lay.setSpacing(theme.pad("md"))
        col = QVBoxLayout()
        col.setSpacing(1)
        name = ThemeLabel(title, "body")
        col.addWidget(name)
        if description:
            desc = ThemeLabel(description, "caption", wrap=True)
            col.addWidget(desc)
        lay.addLayout(col, 1)
        self.toggle = ToggleSwitch(checked)
        lay.addWidget(self.toggle, 0, Qt.AlignmentFlag.AlignVCenter)


class _ProcessRow(QFrame):
    """Linha de app em segundo plano com barras de consumo."""

    def __init__(self, name: str, cpu: float, mem_mb: float, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background: transparent; border: none;")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(theme.pad("sm"), 6, theme.pad("sm"), 6)
        lay.setSpacing(theme.pad("md"))
        from nexus.ui.components import MiniBar

        col = QVBoxLayout()
        col.setSpacing(2)
        head = QHBoxLayout()
        head.setSpacing(theme.pad("sm"))
        lbl = ThemeLabel(name, "body")
        head.addWidget(lbl)
        head.addStretch(1)
        self.cpu_txt = ThemeLabel("", "caption")
        self.cpu_txt.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; font-family: {theme.MONO_STACK};"
            "background: transparent;"
        )
        head.addWidget(self.cpu_txt)
        col.addLayout(head)
        bars = QHBoxLayout()
        bars.setSpacing(theme.pad("sm"))
        self.cpu_bar = MiniBar()
        self.mem_bar = MiniBar()
        bars.addWidget(self.cpu_bar)
        bars.addWidget(self.mem_bar)
        col.addLayout(bars)
        lay.addLayout(col, 1)


class PcOptimizerTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._loading = False

        # -------------------------------------------------------- energia
        power_card = Card("Plano de energia", "zap")
        intro = ThemeLabel(
            "Ativa o modo de alto desempenho do Windows. O plano anterior é salvo e "
            "pode ser restaurado no Histórico.",
            "body_sm", wrap=True,
        )
        power_card.body_layout().addWidget(intro)
        self.power_combo = QComboBox()
        self.power_combo.setMinimumWidth(320)
        self.power_refresh = Button("", "subtle", "refresh")
        self.power_refresh.setToolTip("Recarregar planos")
        self.power_refresh.setAccessibleName("Recarregar planos de energia")
        self.power_apply = Button("Ativar plano selecionado", "primary")
        row = QHBoxLayout()
        row.addWidget(self.power_combo, 1)
        row.addWidget(self.power_refresh)
        row.addWidget(self.power_apply)
        power_card.body_layout().addLayout(row)
        self.power_status = ThemeLabel("", "caption")
        power_card.body_layout().addWidget(self.power_status)
        self.add(power_card)

        self.power_refresh.clicked.connect(self._load_power)
        self.power_apply.clicked.connect(self._apply_power)

        # ------------------------------------------------- efeitos visuais
        vfx_card = Card("Efeitos visuais do Windows", "windows")
        vintro = ThemeLabel(
            "Ajustes leves e 100% reversíveis que reduzem trabalho da GPU/CPU na "
            "interface. Fontes e legibilidade são preservadas.",
            "body_sm", wrap=True,
        )
        vfx_card.body_layout().addWidget(vintro)
        self.vfx_toggles: dict[str, ToggleSwitch] = {}
        for tweak in visual_effects.TWEAKS:
            trow = _ToggleRow(tweak.label, tweak.description)
            trow.toggle.setToolTip("Aplicar este ajuste")
            self.vfx_toggles[tweak.id] = trow.toggle
            vfx_card.body_layout().addWidget(trow)
        vfx_btns = QHBoxLayout()
        self.vfx_apply = Button("Aplicar ajustes selecionados", "primary")
        self.vfx_restore = Button("Restaurar tudo (desfazer)", "danger")
        vfx_btns.addWidget(self.vfx_apply)
        vfx_btns.addWidget(self.vfx_restore)
        vfx_btns.addStretch(1)
        vfx_card.body_layout().addLayout(vfx_btns)
        self.add(vfx_card)

        self.vfx_apply.clicked.connect(self._apply_vfx)
        self.vfx_restore.clicked.connect(self._restore_vfx)

        # --------------------------------------------------------- serviços
        svc_card = Card("Serviços do Windows", "server")
        sintro = ThemeLabel(
            "Apenas serviços catalogados como seguros podem ser ajustados. "
            "Windows Defender, Firewall, Windows Update e serviços essenciais são "
            "bloqueados e nunca exibidos como 'seguros'.",
            "body_sm", wrap=True,
        )
        svc_card.body_layout().addWidget(sintro)

        filter_row = QHBoxLayout()
        self.svc_filter = SearchBox("Filtrar serviços…")
        self.svc_only_safe = ToggleSwitch(False)
        only_safe_lbl = ThemeLabel("Somente seguros de ajustar", "body_sm")
        self.svc_refresh = Button("Recarregar", "secondary", "refresh")
        filter_row.addWidget(self.svc_filter, 1)
        filter_row.addWidget(self.svc_only_safe)
        filter_row.addWidget(only_safe_lbl)
        filter_row.addWidget(self.svc_refresh)
        svc_card.body_layout().addLayout(filter_row)

        self._svc_table = _ServiceTable()
        self._svc_table.setMinimumHeight(320)
        svc_card.body_layout().addWidget(self._svc_table)
        self.svc_detail = ThemeLabel("Selecione um serviço para ver a descrição.", "caption",
                                     wrap=True)
        self.svc_detail.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; background: {theme.SURFACE1};"
            f"border: 1px solid {theme.BORDER}; border-radius: 8px; padding: 8px;"
        )
        self.svc_detail.setMinimumHeight(40)
        svc_card.body_layout().addWidget(self.svc_detail)
        self.add(svc_card)

        self.svc_refresh.clicked.connect(self._load_services)
        self.svc_filter.textChanged.connect(self._svc_table.set_filter)
        self.svc_only_safe.toggled.connect(
            lambda on: self._svc_table.set_only_safe(on)
        )
        self._svc_table.service_selected.connect(self._show_service_detail)
        self._svc_table.service_stop_requested.connect(self._stop_service)
        self._svc_table.service_start_requested.connect(self._start_service)
        self._svc_table.service_type_change_requested.connect(self._svc_type_changed)

        # ------------------------------------------- apps em segundo plano
        bg_card = Card("Aplicativos em segundo plano", "list")
        bgintro = ThemeLabel(
            "Principais aplicativos consumindo recursos agora. Você pode suspendê-los "
            "(retomáveis depois) ou finalizá-los. Processos essenciais são protegidos.",
            "body_sm", wrap=True,
        )
        bg_card.body_layout().addWidget(bgintro)
        self.bg_refresh = Button("Atualizar lista", "secondary", "refresh")
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
            "Todos os ajustes visuais aplicados pelo DK serão revertidos "
            "para os valores originais.",
            dangerous=True, confirm_text="Restaurar",
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
                visual_effects.restore(
                    {"tweaks": {t.id: t.on_default for t in visual_effects.TWEAKS}}
                )
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
        self._svc_table.begin_load()

        def job():
            return services_win.enumerate_services()

        def done(svcs) -> None:
            if svcs is None:
                self._svc_table.set_services([])
                self.svc_detail.setText(
                    "Serviços do Windows disponíveis somente no Windows."
                )
                return
            self._svc_table.set_services(svcs)

        run_task(job, on_done=done)

    def _show_service_detail(self, svc) -> None:
        self.svc_detail.setText(
            f"{svc.reason} — {svc.description or 'sem descrição.'}"
        )

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

    def _svc_type_changed(self, name: str, stype: str, target_label: str) -> None:
        from nexus.ui.components import confirm

        if not confirm(
            self, "Alterar inicialização do serviço",
            f"Alterar o tipo de inicialização de '{name}' para "
            f"'{target_label}'?\nIsso pede elevação (UAC) e é reversível "
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
                empty = ThemeLabel("Nenhum processo consumindo recursos agora.",
                                   "caption")
                self.bg_list.addWidget(empty)
                return
            from nexus.core import safety

            for p in procs:
                row = _ProcessRow(p.name, p.cpu, p.mem_mb)
                row.cpu_bar.set_value(min(100.0, p.cpu))
                row.mem_bar.set_value(min(100.0, p.mem_mb / 64.0))
                row.cpu_txt.setText(f"CPU {p.cpu:.0f}% · RAM {p.mem_mb:.0f} MB")
                if not safety.is_protected_process(p.name):
                    suspend_btn = Button("Suspender", "secondary")
                    suspend_btn.clicked.connect(
                        lambda _=False, pid=p.pid, n=p.name: self._suspend_bg(pid, n)
                    )
                    row.layout().addWidget(suspend_btn)
                    kill_btn = Button("Finalizar", "danger")
                    kill_btn.clicked.connect(
                        lambda _=False, pid=p.pid, n=p.name: self._kill_bg(pid, n)
                    )
                    row.layout().addWidget(kill_btn)
                else:
                    row.layout().addWidget(Pill("protegido", "muted"))
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


# ------------------------------------------------------------ tabela


class _ServiceTable(QTableWidget):
    service_selected = Signal(object)
    service_stop_requested = Signal(str)
    service_start_requested = Signal(str)
    service_type_change_requested = Signal(str, str, str)  # name, stype, label

    def __init__(self, parent=None):
        super().__init__(0, 5, parent)
        self._services: list = []
        self._filter = ""
        self._only_safe = False
        self.setHorizontalHeaderLabels(
            ["Serviço", "Status", "Inicialização", "Recomendação", "Ações"]
        )
        self.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.verticalHeader().setVisible(False)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.currentCellChanged.connect(self._on_select)

    def _on_select(self, row: int, *_args) -> None:
        if row < 0:
            return
        item = self.item(row, 0)
        if not item:
            return
        name = item.data(Qt.ItemDataRole.UserRole)
        for svc in self._services:
            if svc.name == name:
                self.service_selected.emit(svc)
                break

    def begin_load(self) -> None:
        self.setRowCount(0)

    def set_filter(self, text: str) -> None:
        self._filter = text.lower()
        self._populate()

    def set_only_safe(self, on: bool) -> None:
        self._only_safe = on
        self._populate()

    def set_services(self, svcs) -> None:
        self._services = svcs or []
        self._populate()

    def _populate(self) -> None:
        self.setUpdatesEnabled(False)
        self.setRowCount(0)
        for svc in self._services:
            if self._filter and self._filter not in f"{svc.name} {svc.display_name}".lower():
                continue
            if self._only_safe and not svc.safe_to_disable:
                continue
            row = self.rowCount()
            self.insertRow(row)
            name_item = QTableWidgetItem(f"{svc.display_name}\n{svc.name}")
            name_item.setData(Qt.ItemDataRole.UserRole, svc.name)
            self.setItem(row, 0, name_item)
            status_item = QTableWidgetItem(svc.status_label)
            status_item.setForeground(QColor(theme.SUCCESS) if svc.status == "running"
                                      else QColor(theme.TEXT_MUTED))
            self.setItem(row, 1, status_item)
            self.setItem(row, 2, QTableWidgetItem(svc.start_label))
            rec = _RecWidget(svc.safe_to_disable)
            self.setCellWidget(row, 3, rec)
            actions = _SvcActions(svc)
            actions.stop_requested.connect(self.service_stop_requested)
            actions.start_requested.connect(self.service_start_requested)
            actions.type_change_requested.connect(self.service_type_change_requested)
            self.setCellWidget(row, 4, actions)
            self.setRowHeight(row, 48)
        self.setUpdatesEnabled(True)


class _RecWidget(QWidget):
    """Célula de recomendação: chip de risco com texto."""

    def __init__(self, safe: bool, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(4, 4, 4, 4)
        pill = Pill("seguro ajustar" if safe else "não recomendado",
                    "success" if safe else "warning")
        lay.addWidget(pill)
        lay.addStretch(1)


class _SvcActions(QWidget):
    """Ações do serviço na linha: Parar/Iniciar + tipo de inicialização."""

    stop_requested = Signal(str)
    start_requested = Signal(str)
    type_change_requested = Signal(str, str, str)  # name, stype, label

    def __init__(self, svc, parent=None):
        super().__init__(parent)
        self._svc = svc
        lay = QHBoxLayout(self)
        lay.setContentsMargins(4, 4, 4, 4)
        lay.setSpacing(6)
        if svc.status == "running":
            stop_btn = Button("Parar", "danger")
            stop_btn.clicked.connect(lambda: self.stop_requested.emit(svc.name))
            lay.addWidget(stop_btn)
        else:
            start_btn = Button("Iniciar", "secondary")
            start_btn.clicked.connect(lambda: self.start_requested.emit(svc.name))
            lay.addWidget(start_btn)
        combo = QComboBox()
        combo.addItem("Tipo…")
        combo.addItem("Automático", "auto")
        combo.addItem("Manual", "demand")
        combo.addItem("Desativado", "disabled")
        combo.currentIndexChanged.connect(lambda idx, c=combo: self._type(idx, c))
        lay.addWidget(combo)

    def _type(self, idx: int, combo: QComboBox) -> None:
        if idx <= 0:
            return
        stype = combo.itemData(idx)
        label = combo.itemText(idx)
        combo.setCurrentIndex(0)
        self.type_change_requested.emit(self._svc.name, stype, label)
