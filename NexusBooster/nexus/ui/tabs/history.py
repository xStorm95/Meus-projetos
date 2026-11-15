"""Aba Histórico: registro completo de alterações com desfazer e logs de erro."""

from __future__ import annotations

import time

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
)

from nexus.core.worker import run_task
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, confirm, toast_for
from nexus.ui.tabs.base import BaseTab

CATEGORY_LABELS = {
    "clean": "Limpeza",
    "power": "Energia",
    "visual": "Visuais",
    "startup": "Inicialização",
    "service": "Serviço",
    "network": "Rede",
    "network_dns": "DNS",
    "suspend": "Suspensão",
    "session": "Sessão de boost",
    "restore_point": "Restauração",
    "undo": "Desfazer",
}


class HistoryTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)

        # ------------------------------------------------------------ ações
        top = Card("Histórico de alterações", "history")
        row = QHBoxLayout()
        self.filter = QComboBox()
        self.filter.addItem("Todas as categorias", "")
        for cid, label in CATEGORY_LABELS.items():
            self.filter.addItem(label, cid)
        self.filter.currentIndexChanged.connect(self._load)
        refresh = QPushButton("Atualizar")
        refresh.setIcon(icons.icon("refresh", "accent", 16))
        refresh.clicked.connect(self._load)
        undo_all = QPushButton("  DESFAZER OTIMIZAÇÕES")
        undo_all.setProperty("danger", True)
        undo_all.setIcon(icons.icon("undo", "danger", 16))
        undo_all.clicked.connect(self._undo_all)
        row.addWidget(QLabel("Filtro:"))
        row.addWidget(self.filter, 1)
        row.addWidget(refresh)
        row.addWidget(undo_all)
        top.body_layout().addLayout(row)
        self.add(top)

        # ------------------------------------------------------------ tabela
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["Data", "Categoria", "Ação", "Detalhes", "Estado"])
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeMode.Stretch)
        self.table.setColumnWidth(0, 120)
        self.table.setColumnWidth(1, 130)
        self.table.setColumnWidth(4, 150)
        self.table.verticalHeader().setVisible(False)
        self.table.setEditTriggers(QTableWidget.EditTrigger.NoEditTriggers)
        self.table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.table.setMinimumHeight(300)
        self.table.currentCellChanged.connect(self._selected)
        self.add(self.table, 1)

        # -------------------------------------------------------- detalhe + undo
        detail = Card("Detalhe da alteração", "info")
        self.detail_label = QLabel("Selecione uma alteração para ver os detalhes.")
        self.detail_label.setWordWrap(True)
        self.detail_label.setTextFormat(Qt.TextFormat.RichText)
        self.detail_label.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        detail.body_layout().addWidget(self.detail_label)
        drow = QHBoxLayout()
        self.undo_btn = QPushButton("  Desfazer esta alteração")
        self.undo_btn.setProperty("danger", True)
        self.undo_btn.setIcon(icons.icon("undo", "danger", 16))
        self.undo_btn.setEnabled(False)
        self.undo_btn.clicked.connect(self._undo_selected)
        drow.addStretch(1)
        drow.addWidget(self.undo_btn)
        detail.body_layout().addLayout(drow)
        self.add(detail)

        # ------------------------------------------------------------- erros
        err_card = Card("Registro de erros", "alert")
        erow = QHBoxLayout()
        err_refresh = QPushButton("Atualizar")
        err_refresh.clicked.connect(self._load_errors)
        clear_err = QPushButton("Limpar registro")
        clear_err.setProperty("danger", True)
        clear_err.clicked.connect(self._clear_errors)
        open_logs = QPushButton("Abrir pasta de logs")
        open_logs.setIcon(icons.icon("folder", "accent", 16))
        open_logs.clicked.connect(self._open_logs)
        erow.addWidget(err_refresh)
        erow.addWidget(clear_err)
        erow.addWidget(open_logs)
        erow.addStretch(1)
        err_card.body_layout().addLayout(erow)
        self.err_label = QLabel("Nenhum erro registrado.")
        self.err_label.setWordWrap(True)
        self.err_label.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; background: {theme.PANEL};"
            "border-radius: 8px; padding: 8px;"
        )
        self.err_label.setMinimumHeight(60)
        err_card.body_layout().addWidget(self.err_label)
        self.add(err_card)

        self._entries = []
        self._load()
        self._load_errors()

    # ----------------------------------------------------------------- load
    def _load(self) -> None:
        category = self.filter.currentData() or None

        def job():
            return self.services.db.history_list(limit=300, category=category)

        def done(entries) -> None:
            self._entries = entries
            t = self.table
            t.setRowCount(0)
            for e in entries:
                row = t.rowCount()
                t.insertRow(row)
                t.setItem(row, 0, QTableWidgetItem(time.strftime("%d/%m/%y %H:%M", time.localtime(e.ts))))
                t.setItem(row, 1, QTableWidgetItem(CATEGORY_LABELS.get(e.category, e.category)))
                t.setItem(row, 2, QTableWidgetItem(e.action))
                t.setItem(row, 3, QTableWidgetItem(e.description[:120]))
                state = "✔ ativa" if not e.undone else ("↩ desfeita" if e.undone else "—")
                item = QTableWidgetItem(state)
                if e.undone:
                    item.setForeground(Qt.GlobalColor.darkYellow)
                t.setItem(row, 4, item)
            t.resizeRowsToContents()

        run_task(job, on_done=done)

    def _selected(self, row: int, *_a) -> None:
        if row < 0 or row >= len(self._entries):
            return
        e = self._entries[row]
        detail = (
            f"<b>{e.action}</b><br>"
            f"{e.description}<br><br>"
            f"<span style='color:{theme.TEXT_FAINT}'>Categoria: {e.category} · "
            f"{time.strftime('%d/%m/%Y %H:%M:%S', time.localtime(e.ts))}</span>"
        )
        if e.details:
            detail += f"<br><span style='color:{theme.TEXT_FAINT}'>{e.details}</span>"
        self.detail_label.setText(detail)
        self._selected_entry = e
        self.undo_btn.setEnabled(bool(e.undo) and not e.undone)
        if not e.undo:
            self.undo_btn.setToolTip("Esta ação não possui reversão automática (ex.: limpeza de arquivos).")
        elif e.undone:
            self.undo_btn.setToolTip("Já desfeita.")
        else:
            self.undo_btn.setToolTip("Reverte esta alteração usando os valores originais salvos.")

    # ----------------------------------------------------------------- undo
    def _undo_selected(self) -> None:
        e = getattr(self, "_selected_entry", None)
        if not e:
            return
        if not confirm(
            self, "Desfazer alteração",
            f"Reverter: {e.action}?",
            dangerous=True, confirm_text="Desfazer",
        ):
            return

        def job():
            return self.services.engine.undo_entry(e)

        def done(res) -> None:
            ok, msg = res
            toast_for(self, msg, "success" if ok else "error")
            self._load()

        run_task(job, on_done=done)

    def _undo_all(self) -> None:
        undoable = self.services.db.history_undoable()
        if not undoable:
            toast_for(self, "Nada reversível pendente.", "info")
            return
        if not confirm(
            self,
            "Desfazer TODAS as otimizações",
            f"{len(undoable)} alteração(ões) reversível(is) serão revertidas em ordem "
            "inversa (energia, visuais, inicialização, serviços, DNS…).\n\n"
            "Continuar?",
            dangerous=True, confirm_text="Desfazer tudo",
        ):
            return

        def job():
            return self.services.engine.undo_all()

        def done(res) -> None:
            ok_n, total = res
            toast_for(
                self,
                f"{ok_n} de {total} alterações revertidas com sucesso.",
                "success" if ok_n else "warning",
            )
            self._load()

        run_task(job, on_done=done)

    # ----------------------------------------------------------------- erros
    def _load_errors(self) -> None:
        def job():
            return self.services.db.errors_list(limit=20)

        def done(errors) -> None:
            if not errors:
                self.err_label.setText("Nenhum erro registrado.")
                return
            lines = []
            for e in errors[:10]:
                when = time.strftime("%d/%m %H:%M", time.localtime(e.ts))
                lines.append(f"[{when}] {e.module}: {e.message[:160]}")
            self.err_label.setText("\n".join(lines))

        run_task(job, on_done=done)

    def _clear_errors(self) -> None:
        if confirm(self, "Limpar registro de erros",
                   "Apagar o registro de erros do banco? Os arquivos de log não são apagados.",
                   confirm_text="Limpar"):
            self.services.db.errors_clear()
            self._load_errors()

    def _open_logs(self) -> None:
        from nexus.core.paths import logs_dir
        import sys

        folder = str(logs_dir())
        if sys.platform == "win32":
            import os

            os.startfile(folder)
        else:
            from PySide6.QtGui import QDesktopServices
            from PySide6.QtCore import QUrl

            QDesktopServices.openUrl(QUrl.fromLocalFile(folder))
