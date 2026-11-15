"""Assistente de otimização rápida: etapas com risco, resumo e progresso real."""

from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Pill,
    SectionTitle,
    ThemeLabel,
    ToggleSwitch,
    risk_kind,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class _StepRow(QWidget):
    """Linha do assistente: etapa, descrição, chip de risco e seleção."""

    def __init__(self, step, parent=None):
        super().__init__(parent)
        self.step = step
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, theme.pad("sm"), 0, theme.pad("sm"))
        lay.setSpacing(theme.pad("md"))

        col = QVBoxLayout()
        col.setSpacing(2)
        head = QHBoxLayout()
        head.setSpacing(theme.pad("sm"))
        name = ThemeLabel(step.label, "body")
        head.addWidget(name)
        head.addWidget(Pill(step.risk, risk_kind(step.risk)))
        head.addStretch(1)
        col.addLayout(head)
        desc = ThemeLabel(step.description, "caption", wrap=True)
        col.addWidget(desc)
        lay.addLayout(col, 1)

        self.check = QCheckBox()
        self.check.setChecked(True)
        self.check.setToolTip("Incluir esta etapa")
        lay.addWidget(self.check, 0, Qt.AlignmentFlag.AlignVCenter)


class OptimizerWizard(QDialog):
    """Assistente completo de otimização (resumo → execução → economia real)."""

    optimize_done = Signal(object)  # (ok_n, total, report)

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.setWindowTitle("Assistente de otimização")
        self.setMinimumSize(640, 560)
        self._steps = services.engine.build_quick_steps(
            services.settings.get_list("suspend_list")
        )

        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("lg"), theme.pad("md"), theme.pad("lg"),
                               theme.pad("md"))
        lay.setSpacing(theme.pad("sm"))

        lay.addWidget(ThemeLabel("Otimização rápida", "title_sm"))
        lay.addWidget(ThemeLabel(
            "Revisa o computador e aplica apenas ajustes seguros e reversíveis. "
            "Cada etapa mostra o risco e pode ser desmarcada — tudo é registrado no "
            "Histórico para desfazer depois.", "body_sm", wrap=True,
        ))

        # área rolável com as etapas
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        host = QWidget()
        host.setStyleSheet("background: transparent;")
        v = QVBoxLayout(host)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(theme.pad("xs"))
        self._rows: list[_StepRow] = []
        for st in self._steps:
            row = _StepRow(st)
            self._rows.append(row)
            v.addWidget(row)
        v.addStretch(1)
        scroll.setWidget(host)
        lay.addWidget(scroll, 1)

        # ponto de restauração
        rp_row = QHBoxLayout()
        self.rp_toggle = ToggleSwitch(
            self.services.settings.get_bool("restore_point_default")
        )
        rp_row.addWidget(self.rp_toggle)
        rp_row.addWidget(ThemeLabel(
            "Criar ponto de restauração antes de aplicar (recomendado)", "body_sm"
        ))
        rp_row.addStretch(1)
        lay.addLayout(rp_row)

        # resumo
        self.summary = ThemeLabel("", "caption", wrap=True)
        lay.addWidget(self.summary)

        btns = QHBoxLayout()
        btns.addStretch(1)
        cancel = Button("Cancelar")
        cancel.clicked.connect(self.reject)
        self.run_btn = Button("Otimizar agora", "primary", "zap")
        self.run_btn.clicked.connect(self._run)
        btns.addWidget(cancel)
        btns.addWidget(self.run_btn)
        lay.addLayout(btns)
        self._update_summary()

        for row in self._rows:
            row.check.stateChanged.connect(lambda _s: self._update_summary())

    def _selected(self) -> list:
        return [row.step for row in self._rows if row.check.isChecked()]

    def _update_summary(self) -> None:
        sel = self._selected()
        self.summary.setText(
            f"{len(sel)} de {len(self._steps)} etapas selecionadas — "
            "nenhuma etapa é executada sem sua confirmação."
        )

    def _run(self) -> None:
        from nexus.ui.components import TaskDialog, confirm

        selected = self._selected()
        if not selected:
            toast_for(self, "Selecione pelo menos uma etapa.", "warning")
            return
        if not confirm(
            self, "Executar otimização",
            f"{len(selected)} etapa(s) serão aplicadas. As alterações são registradas "
            "no Histórico e podem ser desfeitas individualmente ou todas de uma vez.",
            confirm_text="Otimizar",
        ):
            return

        dlg = TaskDialog("Otimização em andamento", self)
        dlg.set_total(len(selected))
        dlg.show()

        from nexus.core.worker import run_task

        def on_start(name: str) -> None:
            dlg.begin_step(name)

        def on_done(name: str, ok: bool, message: str) -> None:
            dlg.step_done(name, ok, message)

        def job():
            return self.services.engine.run(
                selected, on_start=on_start, on_done=on_done,
                create_rp=self.rp_toggle.isChecked(),
            )

        def done(report) -> None:
            dlg.finish(
                f"Concluído: {report.ok_count} de {report.total} etapas "
                f"aplicadas com sucesso. Detalhes no Histórico."
            )
            self.optimize_done.emit(report)
            toast_for(
                self,
                f"Otimização concluída: {report.ok_count}/{report.total} etapas.",
                "success" if report.ok_count else "warning",
            )
            self.accept()

        def fail(msg) -> None:
            dlg.finish(f"Falha na execução: {msg}")
            toast_for(self, f"Falha na otimização: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)
