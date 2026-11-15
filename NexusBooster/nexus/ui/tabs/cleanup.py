"""Aba Limpeza Avançada: análise por categoria, seleção e relatório real."""

from __future__ import annotations

import time

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QProgressBar,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.optimization import cleaner
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, SectionTitle, ToggleSwitch, confirm, toast_for
from nexus.ui.tabs.base import BaseTab


class _CategoryRow(QFrame):
    def __init__(self, cat: cleaner.Category, parent=None):
        super().__init__(parent)
        self.cat = cat
        self.setStyleSheet(
            f"background: {theme.PANEL}; border: 1px solid {theme.BORDER}; border-radius: 10px;"
        )
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(12)

        col = QVBoxLayout()
        col.setSpacing(2)
        head = QHBoxLayout()
        head.setSpacing(8)
        name = QLabel(cat.label)
        name.setStyleSheet(f"color: {theme.TEXT}; font-size: 13px; font-weight: 700;")
        head.addWidget(name)
        risk = Pill(cat.risk, "success" if cat.risk == "baixo" else "warning")
        head.addWidget(risk)
        if cat.needs_admin:
            adm = Pill("admin", "muted")
            head.addWidget(adm)
        head.addStretch(1)
        self.result = QLabel("")
        self.result.setStyleSheet(f"color: {theme.ACCENT}; font-size: 12px; font-weight: 700;")
        head.addWidget(self.result)
        col.addLayout(head)
        desc = QLabel(cat.description)
        desc.setWordWrap(True)
        desc.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
        col.addWidget(desc)
        lay.addLayout(col, 1)

        self.toggle = ToggleSwitch()
        lay.addWidget(self.toggle, 0, Qt.AlignmentFlag.AlignVCenter)


class CleanupTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._analysis: dict = {}
        self._selected: set[str] = set()

        intro = Card("Limpeza segura de arquivos", "shield_check")
        txt = QLabel(
            "O Nexus Booster analisa antes de excluir, mostra o espaço recuperável de "
            "cada categoria e nunca toca em documentos pessoais, fotos, jogos, saves "
            "ou configurações. Arquivos em uso são preservados automaticamente."
        )
        txt.setWordWrap(True)
        txt.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        intro.body_layout().addWidget(txt)
        self.add(intro)

        # barra de ações
        bar = QFrame()
        bar.setStyleSheet("background: transparent; border: none;")
        bar_l = QHBoxLayout(bar)
        bar_l.setContentsMargins(0, 0, 0, 0)
        bar_l.setSpacing(10)
        self.analyze_btn = QPushButton("  Analisar espaço")
        self.analyze_btn.setProperty("accent", True)
        self.analyze_btn.setIcon(icons.icon("search", "#04121f", 16))
        self.analyze_btn.clicked.connect(self._analyze)
        self.clean_btn = QPushButton("  Limpar selecionados")
        self.clean_btn.setIcon(icons.icon("broom", "accent", 16))
        self.clean_btn.setEnabled(False)
        self.clean_btn.clicked.connect(self._clean)
        self.select_all = ToggleSwitch()
        sel_lbl = QLabel("Selecionar todas as categorias")
        sel_lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        bar_l.addWidget(self.analyze_btn)
        bar_l.addWidget(self.clean_btn)
        bar_l.addStretch(1)
        bar_l.addWidget(self.select_all)
        bar_l.addWidget(sel_lbl)
        self.add(bar)
        self.progress_bar = self.progress
        self.add(self.progress)

        # categorias
        cat_card = Card("Categorias de limpeza", "broom")
        self.rows: dict[str, _CategoryRow] = {}
        for cat in cleaner.CATEGORIES:
            row = _CategoryRow(cat)
            row.toggle.toggled.connect(
                lambda on, cid=cat.id: self._toggle_category(cid, on)
            )
            self.rows[cat.id] = row
            cat_card.body_layout().addWidget(row)
        self.add(cat_card)

        self.select_all.toggled.connect(self._toggle_all)

        # relatório
        self.report_card = Card("Relatório da última limpeza", "history")
        self.report_label = QLabel("Nenhuma limpeza executada nesta sessão.")
        self.report_label.setWordWrap(True)
        self.report_label.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        self.report_card.body_layout().addWidget(self.report_label)
        self.add(self.report_card)

    # ------------------------------------------------------------- seleção
    def _toggle_category(self, cid: str, on: bool) -> None:
        if on:
            self._selected.add(cid)
        else:
            self._selected.discard(cid)
        self.clean_btn.setEnabled(bool(self._selected))

    def _toggle_all(self, on: bool) -> None:
        for cid, row in self.rows.items():
            row.toggle.setChecked(on, emit=True)
        self.clean_btn.setEnabled(bool(self._selected))

    # ------------------------------------------------------------ análise
    def _analyze(self) -> None:
        self.analyze_btn.setEnabled(False)
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)

        def job():
            return cleaner.analyze([c.id for c in cleaner.CATEGORIES])

        def done(results) -> None:
            self._analysis = results
            self.progress.setVisible(False)
            self.analyze_btn.setEnabled(True)
            total = sum(r.bytes for r in results.values())
            for cid, res in results.items():
                self.rows[cid].result.setText(
                    f"{res.files} arquivos · {cleaner.format_size(res.bytes)}"
                )
            self.services.settings.set(
                "last_clean_analysis", {"ts": time.time(), "total_bytes": total}
            )
            toast_for(
                self,
                f"Análise concluída: {cleaner.format_size(total)} recuperáveis.",
                "success",
            )

        def fail(msg) -> None:
            self.progress.setVisible(False)
            self.analyze_btn.setEnabled(True)
            toast_for(self, f"Falha na análise: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)

    # ------------------------------------------------------------- limpeza
    def _clean(self) -> None:
        cats = [self.rows[cid].cat for cid in self._selected]
        total_est = sum(
            self._analysis.get(c.id).bytes if self._analysis.get(c.id) else 0
            for c in cats
        )
        if not confirm(
            self,
            "Executar limpeza",
            f"{len(cats)} categoria(s) selecionada(s).\n"
            f"Espaço estimado: {cleaner.format_size(total_est)}.\n\n"
            "Documentos, jogos e saves nunca são removidos. Deseja continuar?",
            confirm_text="Limpar agora",
        ):
            return

        self.clean_btn.setEnabled(False)
        self.analyze_btn.setEnabled(False)
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)

        ids = list(self._selected)

        def job():
            def progress_cb(label: str, count: int) -> None:
                pass

            return cleaner.clean(ids, progress=progress_cb)

        def done(report) -> None:
            self.progress.setVisible(False)
            self.clean_btn.setEnabled(True)
            self.analyze_btn.setEnabled(True)
            lines = [
                f"✔ Espaço liberado: {cleaner.format_size(report.freed_bytes)}",
                f"✔ Arquivos removidos: {report.deleted}",
                f"✔ Preservados (em uso/protegidos): {report.skipped}",
            ]
            per_cat = []
            for cid, res in report.per_category.items():
                label = self.rows[cid].cat.label
                per_cat.append(f"{label}: {cleaner.format_size(res.bytes)}")
            text = "<br>".join(lines)
            if per_cat:
                text += "<br><br>" + "<br>".join(per_cat)
            self.report_label.setTextFormat(Qt.TextFormat.RichText)
            self.report_label.setText(text)
            self.services.db.history_add(
                "clean",
                "Limpeza avançada",
                description=(
                    f"{cleaner.format_size(report.freed_bytes)} liberados "
                    f"({report.deleted} arquivos)."
                ),
                details="; ".join(per_cat[:6]),
            )
            toast_for(
                self,
                f"Limpeza concluída: {cleaner.format_size(report.freed_bytes)} liberados.",
                "success",
            )
            self._analyze()

        def fail(msg) -> None:
            self.progress.setVisible(False)
            self.clean_btn.setEnabled(True)
            self.analyze_btn.setEnabled(True)
            toast_for(self, f"Falha na limpeza: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)
