"""Aba Inicialização do Windows: ativar/desativar itens com reversão total."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QHBoxLayout,
    QHeaderView,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.optimization import startup as startup_mod
from nexus.ui import theme
from nexus.ui.components import (
    Button,
    Card,
    Pill,
    SearchBox,
    ThemeLabel,
    ToggleSwitch,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class _ToggleCell(QWidget):
    """Célula com toggle estilizado dentro da tabela."""

    def __init__(self, enabled: bool, item, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(8, 2, 8, 2)
        self.toggle = ToggleSwitch(enabled)
        lay.addWidget(self.toggle)
        lay.addStretch(1)
        self._item = item
        self.toggle.toggled.connect(lambda on: self._handle(on))

    def _handle(self, on: bool) -> None:
        # o handler real é conectado pela aba (via setEnabledCallback)
        if self._callback:
            self._callback(self._item, on)

    _callback = None


class _StartupTable(QTableWidget):
    """Tabela de itens de inicialização com impacto e toggle inline."""

    toggle_requested = Signal(object, bool)

    def __init__(self, parent=None):
        super().__init__(0, 4, parent)
        self.setHorizontalHeaderLabels(["Aplicativo", "Origem", "Impacto*", "Ativo"])
        self.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.setColumnWidth(1, 170)
        self.setColumnWidth(2, 110)
        self.setColumnWidth(3, 90)
        self.verticalHeader().setVisible(False)
        self.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.setMinimumHeight(420)

    def populate(self, items, text: str) -> None:
        t = self
        t.setUpdatesEnabled(False)
        t.setRowCount(0)
        for item in items:
            if text and text not in f"{item.name} {item.command}".lower():
                continue
            row = t.rowCount()
            t.insertRow(row)
            name_item = QTableWidgetItem(item.name)
            name_item.setData(Qt.ItemDataRole.UserRole, item)
            t.setItem(row, 0, name_item)
            t.setItem(row, 1, QTableWidgetItem(item.source_label))
            impact = QTableWidgetItem(item.impact)
            color = {"alto": theme.DANGER, "médio": theme.WARNING,
                     "medio": theme.WARNING}.get(item.impact, theme.SUCCESS)
            impact.setForeground(QColor(color))
            t.setItem(row, 2, impact)
            cell = _ToggleCell(item.enabled, item)
            cell._callback = lambda it, on: self.toggle_requested.emit(it, on)
            t.setCellWidget(row, 3, cell)
            t.setRowHeight(row, 44)
        t.resizeRowsToContents()
        t.setUpdatesEnabled(True)


class StartupTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._items: list[startup_mod.StartupItem] = []

        intro = Card("Aplicativos que iniciam com o Windows", "power")
        txt = ThemeLabel(
            "Cada item desativado é guardado pelo Nexus Booster — nada é excluído — "
            "e pode ser reativado aqui ou pelo Histórico. Itens de segurança "
            "(Windows Defender) são bloqueados.",
            "body_sm", wrap=True,
        )
        intro.body_layout().addWidget(txt)
        self.summary = ThemeLabel("—", "accent")
        intro.body_layout().addWidget(self.summary)
        self.add(intro)

        bar = QHBoxLayout()
        self.filter = SearchBox("Filtrar por nome…")
        self.filter.textChanged.connect(self._render)
        refresh = Button("Recarregar", "secondary", "refresh")
        refresh.clicked.connect(self._load)
        bar.addWidget(self.filter, 1)
        bar.addWidget(refresh)
        self.add_layout(bar)

        self.table = _StartupTable()
        self.table.toggle_requested.connect(self._on_toggle)
        self.add(self.table, 1)

        note = ThemeLabel(
            "*Impacto é uma estimativa com base em aplicativos conhecidos — "
            "depende da sua máquina.", "caption",
        )
        self.add(note)

        self._load()

    def _load(self) -> None:
        def job():
            return startup_mod.enumerate_items()

        def done(items) -> None:
            self._items = items
            self._render()

        def fail(_msg) -> None:
            self._items = []
            self._render()
            toast_for(self, "Inicialização do Windows: disponível somente no Windows.",
                      "warning")

        run_task(job, on_done=done, on_error=fail)

    def _render(self) -> None:
        text = self.filter.text().lower().strip()
        enabled = sum(1 for i in self._items if i.enabled)
        self.summary.setText(
            f"{len(self._items)} itens encontrados · {enabled} ativos · "
            f"{len(self._items) - enabled} desativados"
        )
        self.table.populate(self._items, text)

    def _on_toggle(self, item, on: bool) -> None:
        """Ativa/desativa o item (com registro de histórico para reversão)."""
        def job():
            ok, msg = startup_mod.set_enabled(item, on)
            if ok and not on:
                self.services.db.history_add(
                    "startup",
                    f"Inicialização desativada: {item.name}",
                    description=msg,
                    details=f"Comando: {item.command[:200]}",
                    undo={
                        "name": item.name,
                        "command": item.command,
                        "source": item.source,
                    },
                )
            elif ok and on:
                self.services.db.history_add(
                    "startup", f"Inicialização reativada: {item.name}", description=msg
                )
            return ok, msg

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load()

        run_task(job, on_done=done)
