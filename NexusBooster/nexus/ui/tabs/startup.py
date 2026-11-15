"""Aba Inicialização do Windows: ativar/desativar itens com reversão total."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
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
from nexus.optimization import startup as startup_mod
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, toast_for
from nexus.ui.tabs.base import BaseTab


class _ToggleCell(QWidget):
    """Célula com toggle estilizado dentro da tabela."""

    def __init__(self, enabled: bool, item, parent=None):
        super().__init__(parent)
        from nexus.ui.components import ToggleSwitch

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


class StartupTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._items: list[startup_mod.StartupItem] = []

        intro = Card("Aplicativos que iniciam com o Windows", "power")
        txt = QLabel(
            "Cada item desativado é guardado pelo Nexus Booster — nada é excluído — "
            "e pode ser reativado aqui ou pelo Histórico. Itens de segurança "
            "(Windows Defender) são bloqueados."
        )
        txt.setWordWrap(True)
        txt.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        intro.body_layout().addWidget(txt)

        self.summary = QLabel("—")
        self.summary.setStyleSheet(f"color: {theme.ACCENT}; font-size: 13px; font-weight: 700;")
        intro.body_layout().addWidget(self.summary)
        self.add(intro)

        bar = QHBoxLayout()
        self.filter = QLineEdit()
        self.filter.setPlaceholderText("Filtrar por nome…")
        self.filter.textChanged.connect(self._render)
        refresh = QPushButton("Recarregar")
        refresh.setIcon(icons.icon("refresh", "accent", 16))
        refresh.clicked.connect(self._load)
        bar.addWidget(self.filter, 1)
        bar.addWidget(refresh)
        self.add_layout(bar)

        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["Aplicativo", "Origem", "Impacto*", "Ativo"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.table.setColumnWidth(1, 170)
        self.table.setColumnWidth(2, 110)
        self.table.setColumnWidth(3, 90)
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setMinimumHeight(420)
        self.add(self.table, 1)

        note = QLabel(
            "*Impacto é uma estimativa com base em aplicativos conhecidos — "
            "depende da sua máquina."
        )
        note.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
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
            toast_for(self, "Inicialização do Windows: disponível somente no Windows.", "warning")

        run_task(job, on_done=done, on_error=fail)

    def _render(self) -> None:
        text = self.filter.text().lower().strip()
        t = self.table
        t.setRowCount(0)
        enabled = sum(1 for i in self._items if i.enabled)
        self.summary.setText(
            f"{len(self._items)} itens encontrados · {enabled} ativos · "
            f"{len(self._items) - enabled} desativados"
        )
        for item in self._items:
            if text and text not in f"{item.name} {item.command}".lower():
                continue
            row = t.rowCount()
            t.insertRow(row)
            name_item = QTableWidgetItem(item.name)
            t.setItem(row, 0, name_item)
            t.setItem(row, 1, QTableWidgetItem(item.source_label))
            impact = QTableWidgetItem(item.impact)
            if item.impact == "alto":
                impact.setForeground(Qt.GlobalColor.red)
            elif item.impact == "médio":
                impact.setForeground(Qt.GlobalColor.yellow)
            else:
                impact.setForeground(Qt.GlobalColor.green)
            t.setItem(row, 2, impact)

            cell = _ToggleCell(item.enabled, item)
            cell._callback = self._on_toggle
            t.setCellWidget(row, 3, cell)
            t.setRowHeight(row, 44)
        t.resizeRowsToContents()

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
