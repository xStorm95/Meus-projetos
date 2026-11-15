"""Aba Processos: tabela ao vivo com ações seguras (finalizar/suspender/retomar)."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QCheckBox,
    QHBoxLayout,
    QHeaderView,
    QTableWidgetItem,
    QTableWidget,
    QWidget,
    QVBoxLayout,
)

from nexus.core import safety
from nexus.core.worker import run_task
from nexus.system import processes as sys_processes
from nexus.ui import theme
from nexus.ui.components import (
    Button,
    Card,
    MiniBar,
    Pill,
    SearchBox,
    ThemeLabel,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class _ProcessTable(QTableWidget):
    """Tabela de processos reutilizável (aba Processos + diálogo de seleção)."""

    def __init__(self, services, selectable_check: bool = False):
        super().__init__(0, 6 if not selectable_check else 6)
        self.services = services
        self.selectable = selectable_check
        self._data: list = []
        cols = ["PID", "Nome", "CPU %", "RAM (MB)", "Status", "Caminho"]
        if selectable_check:
            cols.insert(0, "Selecionar")
        self.setHorizontalHeaderLabels(cols)
        self.verticalHeader().setVisible(False)
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.horizontalHeader().setSectionResizeMode(
            2 if selectable_check else 1, QHeaderView.ResizeMode.Stretch
        )
        self.setMinimumHeight(300)

    def refresh(self) -> None:
        def job():
            psutil_cpu = sys_processes.list_processes()
            return sorted(psutil_cpu, key=lambda p: (p.cpu, p.mem_mb), reverse=True)

        def done(procs) -> None:
            self._data = procs
            self.populate()

        run_task(job, on_done=done)

    def checked_names(self) -> list[str]:
        names = []
        for row in range(self.rowCount()):
            item = self.item(row, 0)
            if item and item.checkState() == Qt.CheckState.Checked:
                names.append(item.data(Qt.ItemDataRole.UserRole))
        return names

    def populate(self) -> None:
        self.setUpdatesEnabled(False)
        self.setRowCount(0)
        for p in self._data[:400]:
            row = self.rowCount()
            self.insertRow(row)
            if self.selectable:
                chk = QTableWidgetItem("")
                chk.setFlags(Qt.ItemFlag.ItemIsUserCheckable | Qt.ItemFlag.ItemIsEnabled)
                chk.setCheckState(Qt.CheckState.Unchecked)
                chk.setData(Qt.ItemDataRole.UserRole, p.name)
                self.setItem(row, 0, chk)
                base = 1
            else:
                base = 0
            self.setItem(row, base, QTableWidgetItem(str(p.pid)))
            name_item = QTableWidgetItem(p.name)
            if safety.is_protected_process(p.name):
                name_item.setForeground(QColor(theme.WARNING))
            self.setItem(row, base + 1, name_item)

            # CPU/RAM com barras inline
            cpu_cell = _UsageCell(p.cpu, 100.0, f"{p.cpu:.1f}")
            self.setCellWidget(row, base + 2, cpu_cell)
            ram_cell = _UsageCell(p.mem_mb, 8192.0, f"{p.mem_mb:.0f}")
            self.setCellWidget(row, base + 3, ram_cell)

            status = "suspenso" if p.suspended else ("rodando" if p.status == "running" else p.status)
            self.setItem(row, base + 4, QTableWidgetItem(status))
            self.setItem(row, base + 5, QTableWidgetItem(p.exe or "—"))
            self.setRowHeight(row, 40)
        self.resizeRowsToContents()
        self.setUpdatesEnabled(True)


class _UsageCell(QWidget):
    """Célula de uso: valor + barra compacta."""

    def __init__(self, value: float, scale: float, text: str, parent=None):
        super().__init__(parent)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(6, 4, 6, 4)
        lay.setSpacing(2)
        lbl = ThemeLabel(text, "caption")
        lbl.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px;"
            f"font-family: {theme.MONO_STACK}; background: transparent;"
        )
        lay.addWidget(lbl)
        self.bar = MiniBar(min(100.0, value / scale * 100.0))
        lay.addWidget(self.bar)


class ProcessesTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)

        intro = Card("Processos em execução", "list")
        txt = ThemeLabel(
            "Ordenado por consumo real de CPU/RAM (psutil). Processos essenciais do "
            "Windows aparecem em destaque e são protegidos contra finalização. "
            "Suspender é reversível — o app volta exatamente onde estava.",
            "body_sm", wrap=True,
        )
        intro.body_layout().addWidget(txt)

        row = QHBoxLayout()
        self.search = SearchBox("Filtrar por nome ou caminho…")
        self.search.textChanged.connect(lambda _t: self._filter())
        refresh = Button("Atualizar agora", "secondary", "refresh")
        refresh.clicked.connect(self._refresh)
        self.auto_refresh = QCheckBox("Atualização automática (2s)")
        self.auto_refresh.setChecked(True)
        row.addWidget(self.search, 1)
        row.addWidget(self.auto_refresh)
        row.addWidget(refresh)
        intro.body_layout().addLayout(row)
        self.add(intro)

        self.table = _ProcessTable(services)
        self.table.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self._menu)
        self.add(self.table, 1)

        from PySide6.QtCore import QTimer

        self._timer = QTimer(self)
        self._timer.setInterval(2000)
        self._timer.timeout.connect(self._auto_tick)
        self._timer.start()

        self._refresh()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._refresh()

    def _auto_tick(self) -> None:
        if self.auto_refresh.isChecked() and self.isVisible():
            self._refresh()

    def _refresh(self) -> None:
        self.table.refresh()

    def _filter(self) -> None:
        text = self.search.text().lower()
        for row in range(self.table.rowCount()):
            visible = True
            if text:
                row_text = " ".join(
                    (self.table.item(row, c).text() if self.table.item(row, c) else "")
                    for c in range(2, 7)
                ).lower()
                visible = text in row_text
            self.table.setRowHidden(row, not visible)

    def _menu(self, pos) -> None:
        from PySide6.QtWidgets import QMenu

        row = self.table.rowAt(pos.y())
        if row < 0:
            return
        pid_item = self.table.item(row, 0)
        name_item = self.table.item(row, 1)
        if not pid_item or not name_item:
            return
        pid = int(pid_item.text())
        name = name_item.text()

        menu = QMenu(self)
        act_kill = menu.addAction("Finalizar processo")
        act_suspend = menu.addAction("Suspender")
        act_resume = menu.addAction("Retomar")
        if safety.is_protected_process(name):
            for a in (act_kill, act_suspend):
                a.setEnabled(False)
        chosen = menu.exec(self.table.viewport().mapToGlobal(pos))
        if chosen is act_kill:
            self._act(sys_processes.terminate, pid, name)
        elif chosen is act_suspend:
            self._act(sys_processes.suspend, pid, name)
        elif chosen is act_resume:
            self._act(sys_processes.resume, pid, name)

    def _act(self, fn, pid: int, name: str) -> None:
        if fn is sys_processes.terminate:
            from nexus.ui.components import confirm

            if not confirm(self, "Finalizar processo",
                           f"Finalizar '{name}' (PID {pid})? Dados não salvos serão perdidos.",
                           dangerous=True, confirm_text="Finalizar"):
                return

        def job():
            return fn(pid, name)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._refresh()

        run_task(job, on_done=done)
