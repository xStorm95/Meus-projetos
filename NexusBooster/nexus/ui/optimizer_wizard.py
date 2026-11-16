"""Assistente de otimização rápida: etapas com risco, resumo e progresso real."""

from __future__ import annotations

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QScrollArea,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.ui import icons, theme
from nexus.ui.components import (
    Button,
    Card,
    Pill,
    SectionTitle,
    TaskDialog,
    ThemeLabel,
    ToggleSwitch,
    confirm,
    risk_kind,
    toast_for,
)


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
        name = ThemeLabel(step.title, "body")
        head.addWidget(name)
        head.addWidget(Pill(step.risk, risk_kind(step.risk)))
        head.addStretch(1)
        col.addLayout(head)
        desc = ThemeLabel(step.description, "caption", wrap=True)
        col.addWidget(desc)
        lay.addLayout(col, 1)

        self.checkbox = QCheckBox()
        self.checkbox.setChecked(bool(step.default_on))
        self.checkbox.setToolTip("Incluir esta etapa")
        lay.addWidget(self.checkbox, 0, Qt.AlignmentFlag.AlignVCenter)


class _InsightRow(QWidget):
    """Recomendação baseada em dados reais do computador do usuário."""

    def __init__(self, icon_name: str, color: str, text: str, parent=None):
        super().__init__(parent)
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 4, 0, 4)
        lay.setSpacing(theme.pad("sm"))
        from PySide6.QtWidgets import QLabel

        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, color, 15))
        lay.addWidget(ic, 0, Qt.AlignmentFlag.AlignVCenter)
        lbl = ThemeLabel(text, "body_sm", wrap=True)
        lay.addWidget(lbl, 1)


class OptimizerWizard(QDialog):
    """Assistente completo de otimização (recomendações → execução → resumo)."""

    optimize_done = Signal(object)  # lista de StepResult

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.setWindowTitle("Assistente de otimização")
        self.setMinimumSize(660, 600)
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

        # ------------------------------------- recomendações para ESTE PC
        insights = self._pc_insights()
        if insights:
            rec_card = Card("Recomendações para o seu computador", "cpu")
            for icon_name, color, text in insights:
                rec_card.body_layout().addWidget(_InsightRow(icon_name, color, text))
            lay.addWidget(rec_card)

        # --------------------------------------------- etapas (rolável)
        lay.addWidget(SectionTitle("Etapas da otimização"))
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setStyleSheet("QScrollArea { background: transparent; border: none; }")
        host = QWidget()
        host.setStyleSheet("background: transparent;")
        v = QVBoxLayout(host)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(theme.pad("xs"))
        self.rows: list[_StepRow] = []
        for st in self._steps:
            row = _StepRow(st)
            self.rows.append(row)
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

        for row in self.rows:
            row.checkbox.stateChanged.connect(lambda _s: self._update_summary())

    # ------------------------------------------------ recomendações reais
    def _pc_insights(self) -> list[tuple[str, str, str]]:
        """Sugestões com base no hardware e no estado ATUAL do computador."""
        out: list[tuple[str, str, str]] = []
        mon = getattr(self.services, "monitor", None)
        hw = getattr(mon, "hardware", None)
        snap = getattr(mon, "latest", None)

        try:
            models = " ".join((d.model or "") for d in hw.disks).lower()
            has_ssd = ("ssd" in models) or ("nvme" in models)
            if hw.disks and not has_ssd:
                out.append(("disk", theme.WARNING,
                            "Nenhum SSD/NVMe detectado — migrar o Windows para um SSD "
                            "é a melhoria de desempenho mais impactante para este PC."))
            elif hw.disks:
                out.append(("disk", theme.SUCCESS,
                            f"Disco principal: {hw.disks[0].model} "
                            f"({hw.disks[0].size_gb:.0f} GB) — já é rápido."))
        except Exception:  # noqa: BLE001
            pass

        try:
            if hw.ram_total_gb and hw.ram_total_gb <= 8:
                out.append(("ram", theme.WARNING,
                            f"RAM total de {hw.ram_total_gb:.0f} GB — manter poucos "
                            "aplicativos de inicialização faz diferença real."))
        except Exception:  # noqa: BLE001
            pass

        try:
            if snap and snap.disks:
                d0 = snap.disks[0]
                if d0.free_gb < 20:
                    out.append(("alert", theme.DANGER,
                                f"Somente {d0.free_gb:.0f} GB livres em {d0.path} — "
                                "rode a Limpeza Avançada antes de jogar."))
        except Exception:  # noqa: BLE001
            pass

        try:
            if snap and snap.uptime_hours > 72:
                out.append(("clock", theme.WARNING,
                            f"Computador ligado há {snap.uptime_hours:.0f} horas — "
                            "um reinício libera memória e conclui atualizações."))
        except Exception:  # noqa: BLE001
            pass

        try:
            if snap and snap.ram_percent > 85:
                out.append(("ram", theme.WARNING,
                            f"Uso de RAM em {snap.ram_percent:.0f}% agora — apps em "
                            "segundo plano serão suspensos durante o boost."))
        except Exception:  # noqa: BLE001
            pass

        if len(out) >= 4:
            out = out[:4]
        if not out:
            out.append(("check_circle", theme.SUCCESS,
                        "Seu computador está em boas condições — as etapas abaixo "
                        "são melhorias finas e seguras."))
        return out

    # ------------------------------------------------------------- seleção
    def _selected(self) -> list:
        return [row.step for row in self.rows if row.checkbox.isChecked()]

    def _update_summary(self) -> None:
        sel = self._selected()
        self.summary.setText(
            f"{len(sel)} de {len(self._steps)} etapas selecionadas — "
            "nenhuma etapa é executada sem sua confirmação."
        )

    # ------------------------------------------------------------- execução
    def _run(self) -> None:
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

        # etapas de energia/serviços/efeitos visuais podem exigir elevação —
        # avisa ANTES de rodar em vez de falhar no meio
        from nexus.ui.components import ensure_admin_or_warn

        if not ensure_admin_or_warn(self, "Otimização do Windows"):
            return

        self.accept()
        dialog = TaskDialog("Otimização em andamento", self.parent())
        create_rp = self.rp_toggle.isChecked()
        dialog.set_total(len(selected) + (1 if create_rp else 0))
        dialog.show()

        engine = self.services.engine

        # Ponte thread-safe: sinais Qt garantem que o diálogo só seja
        # tocado pela thread principal (os callbacks rodam na worker).
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
                on_step_start=lambda name: bridge.step_started.emit(name),
                on_step_done=lambda result: bridge.step_done.emit(result),
                create_rp=create_rp,
            )

        def done(results) -> None:
            ok_count = sum(1 for r in results if r.ok)
            total = len(results)
            freed = sum(r.freed_bytes for r in results)
            extra = f" — {freed / 1024**2:.1f} MB liberados" if freed else ""
            dialog.finish(f"Concluído: {ok_count}/{total} etapas com sucesso{extra}.")
            self.optimize_done.emit(results)
            toast_for(
                dialog.parent() or self,
                f"Otimização concluída: {ok_count}/{total} etapas.{extra}",
                "success" if ok_count == total else "warning",
            )

        def fail(msg) -> None:
            dialog.finish(f"Falha: {msg}")
            toast_for(self.parent() or self, f"Falha na otimização: {msg}", "error")

        run_task(job, on_done=done, on_error=fail)
