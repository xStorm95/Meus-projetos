"""Aba Histórico: registro completo de alterações com desfazer e logs de erro."""

from __future__ import annotations

import time

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QHeaderView,
    QTableWidgetItem,
    QTableWidget,
)

from nexus.core.worker import run_task
from nexus.ui import theme
from nexus.ui.components import (
    Button,
    Card,
    ThemeLabel,
    confirm,
    toast_for,
)
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
        refresh = Button("Atualizar", "secondary", "refresh")
        refresh.clicked.connect(self._load)
        export_csv = Button("Exportar CSV", "secondary", "download")
        export_csv.setToolTip("Salva o histórico completo em planilha (CSV)")
        export_csv.clicked.connect(self._export_csv)
        undo_all = Button("Desfazer otimizações", "danger", "undo")
        undo_all.clicked.connect(self._undo_all)
        row.addWidget(ThemeLabel("Filtro:"))
        row.addWidget(self.filter, 1)
        row.addWidget(refresh)
        row.addWidget(export_csv)
        row.addWidget(undo_all)
        top.body_layout().addLayout(row)
        self.add(top)

        # ------------------------------------------------------------ tabela
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(
            ["Data", "Categoria", "Ação", "Detalhes", "Estado"]
        )
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
        self.detail_label = ThemeLabel("Selecione uma alteração para ver os detalhes.",
                                       "body_sm", wrap=True)
        self.detail_label.setTextFormat(Qt.TextFormat.RichText)
        detail.body_layout().addWidget(self.detail_label)
        drow = QHBoxLayout()
        self.undo_btn = Button("Desfazer esta alteração", "danger", "undo")
        self.undo_btn.setEnabled(False)
        self.undo_btn.clicked.connect(self._undo_selected)
        drow.addStretch(1)
        drow.addWidget(self.undo_btn)
        detail.body_layout().addLayout(drow)
        self.add(detail)

        # ------------------------------------------------------------- erros
        err_card = Card("Registro de erros", "alert")
        erow = QHBoxLayout()
        err_refresh = Button("Atualizar", "secondary", "refresh")
        err_refresh.clicked.connect(self._load_errors)
        self.err_filter = QComboBox()
        self.err_filter.addItem("Todos os níveis", "")
        self.err_filter.addItem("Avisos (WARNING)", "WARNING")
        self.err_filter.addItem("Erros (ERROR)", "ERROR")
        self.err_filter.addItem("Críticos (CRITICAL)", "CRITICAL")
        self.err_filter.currentIndexChanged.connect(self._load_errors)
        export_err = Button("Exportar", "secondary", "download")
        export_err.clicked.connect(self._export_errors)
        clear_err = Button("Limpar registro", "danger")
        clear_err.clicked.connect(self._clear_errors)
        open_logs = Button("Abrir pasta de logs", "secondary", "folder")
        open_logs.clicked.connect(self._open_logs)
        erow.addWidget(err_refresh)
        erow.addWidget(self.err_filter)
        erow.addWidget(export_err)
        erow.addWidget(clear_err)
        erow.addWidget(open_logs)
        erow.addStretch(1)
        err_card.body_layout().addLayout(erow)
        # lista monoespaçada — cada linha é um evento; tooltip mostra o traceback
        from PySide6.QtWidgets import QListWidget
        self.err_list = QListWidget()
        self.err_list.setWordWrap(True)
        self.err_list.setStyleSheet(
            f"QListWidget {{ background: {theme.SURFACE1}; border: 1px solid {theme.BORDER};"
            f" border-radius: 8px; color: {theme.TEXT_MUTED};"
            f" font-family: {theme.MONO_STACK}; font-size: 11px; }}"
            f"QListWidget::item {{ padding: 6px 8px; border-bottom: 1px solid {theme.BORDER}; }}"
        )
        self.err_list.setMinimumHeight(140)
        self.err_list.setMaximumHeight(240)
        err_card.body_layout().addWidget(self.err_list)
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
            t.setUpdatesEnabled(False)
            t.setRowCount(0)
            for e in entries:
                row = t.rowCount()
                t.insertRow(row)
                t.setItem(
                    row, 0,
                    QTableWidgetItem(
                        time.strftime("%d/%m/%y %H:%M", time.localtime(e.ts))
                    ),
                )
                t.setItem(
                    row, 1,
                    QTableWidgetItem(CATEGORY_LABELS.get(e.category, e.category)),
                )
                t.setItem(row, 2, QTableWidgetItem(e.action))
                t.setItem(row, 3, QTableWidgetItem(e.description[:120]))
                if e.undone:
                    state = QTableWidgetItem("desfeita")
                    state.setForeground(QColor(theme.TEXT_MUTED))
                else:
                    state = QTableWidgetItem("ativa")
                    state.setForeground(QColor(theme.SUCCESS))
                t.setItem(row, 4, state)
                t.setRowHeight(row, 38)
            t.resizeRowsToContents()
            t.setUpdatesEnabled(True)

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
            self.undo_btn.setToolTip(
                "Esta ação não possui reversão automática (ex.: limpeza de arquivos)."
            )
        elif e.undone:
            self.undo_btn.setToolTip("Já desfeita.")
        else:
            self.undo_btn.setToolTip(
                "Reverte esta alteração usando os valores originais salvos."
            )

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

    # --------------------------------------------------------------- export
    def _export_csv(self) -> None:
        import csv

        from PySide6.QtWidgets import QFileDialog

        path, _ = QFileDialog.getSaveFileName(
            self, "Exportar histórico", "dk-historico.csv", "Planilha CSV (*.csv)"
        )
        if not path:
            return

        def job():
            return self.services.db.history_list(limit=100000)

        def done(entries) -> None:
            try:
                # utf-8-sig + ';' → abre direto no Excel em português
                with open(path, "w", newline="", encoding="utf-8-sig") as fh:
                    writer = csv.writer(fh, delimiter=";")
                    writer.writerow(["Data", "Categoria", "Ação", "Descrição",
                                     "Detalhes", "Estado"])
                    for e in entries:
                        writer.writerow([
                            time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(e.ts)),
                            CATEGORY_LABELS.get(e.category, e.category),
                            e.action,
                            e.description or "",
                            e.details or "",
                            "desfeita" if e.undone else "ativa",
                        ])
                toast_for(self, f"Histórico exportado: {len(entries)} registros.", "success")
            except Exception as exc:  # noqa: BLE001
                toast_for(self, f"Falha ao exportar: {exc}", "error")

        run_task(job, on_done=done)

    # ----------------------------------------------------------------- erros
    def _load_errors(self) -> None:
        level = self.err_filter.currentData() if hasattr(self, "err_filter") else ""

        def job():
            return self.services.db.errors_list(limit=200, level=level or "")

        def done(errors) -> None:
            from PySide6.QtWidgets import QListWidgetItem

            self.err_list.clear()
            if not errors:
                self.err_list.addItem("Nenhum registro neste nível. ✓")
                return
            colors = {"WARNING": theme.WARNING, "ERROR": theme.DANGER,
                      "CRITICAL": theme.DANGER}
            for e in errors:
                when = time.strftime("%d/%m/%Y %H:%M", time.localtime(e.ts))
                item = QListWidgetItem(f"[{when}] {e.level:8s} {e.module}: {e.message[:200]}")
                item.setForeground(QColor(colors.get(e.level, theme.TEXT_MUTED)))
                tip = e.traceback.strip() if e.traceback else "(sem traceback)"
                item.setToolTip(tip[:2000])
                self.err_list.addItem(item)

        run_task(job, on_done=done)

    def _export_errors(self) -> None:
        """Exporta o registro de erros completo em .txt (abrível em qualquer lugar)."""
        from PySide6.QtWidgets import QFileDialog

        path, _ = QFileDialog.getSaveFileName(
            self, "Exportar registro de erros", "dk-erros.txt", "Texto (*.txt)"
        )
        if not path:
            return

        def job():
            rows = self.services.db.errors_list(limit=100000)
            lines = []
            for e in rows:
                when = time.strftime("%d/%m/%Y %H:%M:%S", time.localtime(e.ts))
                lines.append(f"[{when}] {e.level} {e.module}: {e.message}")
                if e.traceback:
                    lines.append(e.traceback.rstrip())
            return "\n".join(lines)

        def done(text) -> None:
            try:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(text or "(nenhum erro registrado)")
                toast_for(self, f"Erros exportados para {path}", "success")
            except OSError as exc:
                toast_for(self, f"Falha ao exportar: {exc}", "error")

        run_task(job, on_done=done)

    def _clear_errors(self) -> None:
        if confirm(self, "Limpar registro de erros",
                   "Apagar o registro de erros do banco? Os arquivos de log não são "
                   "apagados.", confirm_text="Limpar"):
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
