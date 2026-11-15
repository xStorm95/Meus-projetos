"""Assistente de otimização: seleção transparente de etapas + execução com relatório."""

from __future__ import annotations

import logging

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.ui import icons, theme
from nexus.ui.components import Pill, TaskDialog, toast_for

log = logging.getLogger("nexus.wizard")


class _StepRow(QFrame):
    def __init__(self, step, default_on: bool, parent=None):
        super().__init__(parent)
        self.step = step
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
        title = QLabel(step.title)
        title.setStyleSheet(f"color: {theme.TEXT}; font-size: 13px; font-weight: 700;")
        head.addWidget(title)
        risk = Pill(step.risk, "success" if step.risk == "baixo" else "warning")
        head.addWidget(risk)
        head.addStretch(1)
        col.addLayout(head)
        desc = QLabel(step.description)
        desc.setWordWrap(True)
        desc.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
        col.addWidget(desc)
        lay.addLayout(col, 1)

        self.checkbox = QCheckBox("")
        self.checkbox.setChecked(default_on)
        self.checkbox.setStyleSheet("QCheckBox::indicator { width: 20px; height: 20px; }")
        lay.addWidget(self.checkbox, 0, Qt.AlignmentFlag.AlignVCenter)


class OptimizerWizard(QDialog):
    """Janela de escolha das otimizações — tudo explicado e opcional."""

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.setWindowTitle("Otimizar agora — Nexus Booster")
        self.setModal(True)
        self.setMinimumSize(640, 560)

        lay = QVBoxLayout(self)
        lay.setContentsMargins(22, 18, 22, 18)
        lay.setSpacing(14)

        header = QVBoxLayout()
        h = QLabel("O que o Nexus Booster vai fazer")
        h.setStyleSheet(f"color: {theme.TEXT}; font-size: 16px; font-weight: 800;")
        header.addWidget(h)
        sub = QLabel(
            "Cada etapa é segura, explicada e reversível. Desmarque o que não quiser."
        )
        sub.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        header.addWidget(sub)
        lay.addLayout(header)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        inner = QWidget()
        inner.setStyleSheet("background: transparent;")
        self.steps_layout = QVBoxLayout(inner)
        self.steps_layout.setContentsMargins(0, 0, 8, 0)
        self.steps_layout.setSpacing(8)
        scroll.setWidget(inner)
        lay.addWidget(scroll, 1)

        self.rows: list[_StepRow] = []
        steps = services.engine.build_quick_steps(
            services.settings.get_list("suspend_list")
        )
        for step in steps:
            row = _StepRow(step, step.default_on)
            self.rows.append(row)
            self.steps_layout.addWidget(row)
        self.steps_layout.addStretch(1)

        # ponto de restauração
        self.rp_check = QCheckBox(
            "Criar ponto de restauração do Windows antes de aplicar (recomendado)"
        )
        self.rp_check.setChecked(
            self.services.settings.get_bool("restore_point_default")
        )
        self.rp_check.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 12px; font-weight: 600;"
        )
        lay.addWidget(self.rp_check)

        btns = QHBoxLayout()
        btns.addStretch(1)
        cancel = QPushButton("Cancelar")
        cancel.clicked.connect(self.reject)
        btns.addWidget(cancel)
        go = QPushButton("  Executar otimizações")
        go.setProperty("accent", True)
        go.setIcon(icons.icon("zap", "#04121f", 16))
        go.clicked.connect(self._run)
        btns.addWidget(go)
        lay.addLayout(btns)

    def _run(self) -> None:
        selected = [row.step for row in self.rows if row.checkbox.isChecked()]
        if not selected:
            toast_for(self, "Selecione pelo menos uma etapa.", "warning")
            return
        self.accept()

        dialog = TaskDialog("Otimizando o sistema", self.parent())
        dialog.set_total(len(selected) + (1 if self.rp_check.isChecked() else 0))
        dialog.show()

        engine = self.services.engine
        create_rp = self.rp_check.isChecked()

        # Ponte thread-safe: sinais Qt garantem que o diálogo só seja
        # tocado pela thread principal (callbacks rodam na worker).
        from PySide6.QtCore import QObject, Signal

        class _Bridge(QObject):
            step_started = Signal(str)
            step_done = Signal(object)

        bridge = _Bridge(dialog)
        bridge.step_started.connect(dialog.begin_step)
        bridge.step_done.connect(
            lambda result: dialog.step_done(result.title, result.ok, result.message)
        )

        def job():
            return engine.run(
                selected,
                on_start=lambda name: bridge.step_started.emit(name),
                on_done=lambda result: bridge.step_done.emit(result),
                create_rp=create_rp,
            )

        def done(results) -> None:
            ok_count = sum(1 for r in results if r.ok)
            total = len(results)
            freed = sum(r.freed_bytes for r in results)
            extra = f" — {freed / 1024**2:.1f} MB liberados" if freed else ""
            dialog.finish(f"Concluído: {ok_count}/{total} etapas com sucesso{extra}.")
            toast_for(
                dialog.parent() or self,
                f"Otimização concluída: {ok_count}/{total} etapas.{extra}",
                "success" if ok_count == total else "warning",
            )

        def fail(msg: str) -> None:
            dialog.finish(f"Falha: {msg}")
            toast_for(self.parent() or self, f"Falha na otimização: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)
