"""Motor de otimização: orquestra etapas seguras, reversíveis e auditadas."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Optional

from nexus.core import safety
from nexus.optimization import cleaner, power, restore_point, visual_effects
from nexus.system import processes as sys_processes

log = logging.getLogger("nexus.engine")


@dataclass
class StepResult:
    step_id: str
    title: str
    ok: bool
    message: str
    undo: Optional[dict] = None
    history_category: str = ""
    history_action: str = ""
    freed_bytes: int = 0


@dataclass
class Step:
    id: str
    title: str
    description: str
    risk: str
    default_on: bool
    available: Callable[[], tuple[bool, str]] = lambda: (True, "")
    run: Optional[Callable[[], StepResult]] = None


class OptimizationEngine:
    """Constrói e executa conjuntos de otimização com histórico + undo."""

    def __init__(self, db):
        self._db = db

    # --------------------------------------------------------- catálogo
    def build_quick_steps(self, suspend_list: Optional[list[str]] = None) -> list[Step]:
        """Etapas do botão 'OTIMIZAR AGORA' (todas com explicação clara)."""
        steps: list[Step] = []

        steps.append(
            Step(
                "quick_clean", "Limpeza rápida de temporários",
                "Remove arquivos temporários do usuário e caches de shaders/DirectX "
                "antigos (mais de 10 minutos). Não toca em documentos, jogos ou saves.",
                "baixo", True,
                run=lambda: self._run_quick_clean(),
            )
        )
        steps.append(
            Step(
                "power_plan", "Plano de energia de alto desempenho",
                "Ativa (ou cria) o plano 'DK — Desempenho' baseado no plano "
                "Alto Desempenho do Windows. Reversível a qualquer momento.",
                "baixo", True,
                available=lambda: (True, "") if power.list_plans() else
                (False, "powercfg indisponível neste sistema."),
                run=lambda: self._run_power(),
            )
        )
        steps.append(
            Step(
                "vfx", "Reduzir efeitos visuais",
                "Desativa transparências e animações não essenciais do Windows "
                "(mantém fontes e aparência legível). Todos os valores originais são "
                "salvos e restauráveis.",
                "baixo", False,
                run=lambda: self._run_vfx(),
            )
        )
        steps.append(
            Step(
                "flush_dns", "Limpar cache de DNS",
                "Executa 'ipconfig /flushdns' — força o Windows a resolver nomes de "
                "novo, útil após mudanças de rede.",
                "baixo", True,
                run=lambda: self._run_flush_dns(),
            )
        )
        steps.append(
            Step(
                "suspend_bg", "Suspender aplicativos em segundo plano",
                "Suspende (não fecha) aplicativos conhecidos e não essenciais listados "
                "no perfil de otimização. Eles são retomados automaticamente ao encerrar "
                "a sessão de boost.",
                "baixo", False,
                run=lambda: self._run_suspend(suspend_list or []),
            )
        )
        return [s for s in steps if s.available()[0]]

    # ----------------------------------------------------------- runners
    def _run_quick_clean(self) -> StepResult:
        progress: Callable = lambda *a: None
        report = cleaner.clean(
            ["temp_user", "directx_cache", "wer"], progress=progress
        )
        self._db.history_add(
            "clean", "Limpeza rápida de temporários",
            description=f"{report.deleted} arquivos removidos, "
                        f"{cleaner.format_size(report.freed_bytes)} liberados.",
            details=f"Ignorados (em uso/protegidos): {report.skipped}",
        )
        return StepResult(
            "quick_clean", "Limpeza rápida",
            True,
            f"{cleaner.format_size(report.freed_bytes)} liberados "
            f"({report.deleted} arquivos; {report.skipped} em uso foram preservados).",
            freed_bytes=report.freed_bytes,
        )

    def _run_power(self) -> StepResult:
        ok, msg, undo = power.activate_performance()
        if ok:
            self._db.history_add(
                "power", "Plano de energia alterado", description=msg, undo=undo
            )
        return StepResult("power_plan", "Plano de energia", ok, msg, undo or None)

    def _run_vfx(self) -> StepResult:
        ids = [t.id for t in visual_effects.TWEAKS]
        ok, msg, undo = visual_effects.apply_tweaks(ids)
        if ok:
            visual_effects.notify_explorer()
            self._db.history_add("visual", "Efeitos visuais ajustados", description=msg, undo=undo)
        return StepResult("vfx", "Efeitos visuais", ok, msg, undo or None)

    def _run_flush_dns(self) -> StepResult:
        from nexus.system import powershell as ps

        ok, _ = ps.run_cmd(["ipconfig", "/flushdns"], timeout=15)
        if ok:
            self._db.history_add("network", "Cache DNS limpo", description="ipconfig /flushdns executado.")
        return StepResult(
            "flush_dns", "Cache DNS",
            ok, "Cache de DNS limpo." if ok else "Falha ao limpar cache DNS.",
        )

    def _run_suspend(self, suspend_list: list[str]) -> StepResult:
        suspended: list[str] = []
        protected_skipped: list[str] = []
        for proc in sys_processes.find_by_names(suspend_list):
            try:
                name = proc.name()
            except Exception:
                continue
            if safety.is_protected_process(name):
                protected_skipped.append(name)
                continue
            ok, _msg = sys_processes.suspend(proc.pid, name)
            if ok:
                suspended.append(name)
        if not suspend_list:
            return StepResult(
                "suspend_bg", "Suspender aplicativos",
                True, "Nenhum aplicativo configurado na lista de suspensão.",
            )
        msg = f"{len(suspended)} aplicativo(s) suspensos e retomáveis."
        if protected_skipped:
            msg += f" Protegidos e ignorados: {', '.join(protected_skipped)}."
        if suspended:
            self._db.history_add(
                "suspend", "Aplicativos suspensos", description=msg,
                undo={"resume": suspended},
            )
        return StepResult("suspend_bg", "Suspender aplicativos", True, msg)

    # ----------------------------------------------------------- execução
    def run(
        self,
        steps: list[Step],
        on_step_start: Callable[[str], None],
        on_step_done: Callable[[StepResult], None],
        create_rp: bool = False,
    ) -> list[StepResult]:
        """Executa etapas em sequência (chamar dentro de uma thread)."""
        results: list[StepResult] = []

        if create_rp:
            on_step_start("Criando ponto de restauração")
            ok, msg = restore_point.create()
            self._db.history_add(
                "restore_point", "Ponto de restauração",
                description=msg,
            )
            on_step_done(StepResult("restore_point", "Ponto de restauração", ok, msg))

        for step in steps:
            if step.run is None:
                continue
            on_step_start(step.title)
            try:
                res = step.run()
            except Exception as exc:  # noqa: BLE001
                log.exception("etapa %s falhou: %s", step.id, exc)
                from nexus.core.logging_setup import format_exception

                self._db.error_add("engine", f"Etapa {step.id}: {exc}", format_exception(exc))
                res = StepResult(step.id, step.title, False, f"Erro: {exc}")
            on_step_done(res)
            results.append(res)
        return results

    # ---------------------------------------------------------------- undo
    def resume_processes(self, names: list[str]) -> int:
        count = 0
        for proc in sys_processes.find_by_names(names):
            ok, _ = sys_processes.resume(proc.pid, proc.name())
            count += 1 if ok else 0
        return count

    def undo_entry(self, entry) -> tuple[bool, str]:
        """Desfaz uma entrada do histórico com payload de undo."""
        if entry.undone:
            return False, "Esta alteração já foi desfeita."
        if not entry.undo:
            return False, "Esta ação não possui reversão automática."

        undo = entry.undo
        category = entry.category
        try:
            if category == "power":
                ok, msg = power.restore_plan(undo.get("previous_guid", ""))
            elif category == "visual":
                ok, msg = visual_effects.restore(undo)
            elif category == "startup":
                from nexus.optimization import startup

                ok, msg = startup.undo_disable(undo)
            elif category == "service":
                from nexus.optimization import services_win

                ok, msg = services_win.restore(undo)
            elif category == "suspend":
                n = self.resume_processes(undo.get("resume", []))
                ok, msg = True, f"{n} processo(s) retomado(s)."
            elif category == "network_dns":
                from nexus.network import diagnostics

                ok, msg = diagnostics.restore_dns(undo)
            else:
                ok, msg = False, f"Categoria '{category}' sem reversão automática."

            if ok:
                self._db.history_mark_undone(entry.id)
            return ok, msg
        except Exception as exc:  # noqa: BLE001
            log.exception("undo falhou: %s", exc)
            return False, f"Falha ao desfazer: {exc}"

    def undo_all(self) -> tuple[int, int]:
        """Desfaz (em ordem reversa) tudo que for reversível. (ok, total)"""
        entries = self._db.history_undoable()
        ok_count = 0
        for entry in reversed(entries):
            ok, _ = self.undo_entry(entry)
            ok_count += 1 if ok else 0
        self._db.history_add(
            "undo", "Desfazer otimizações",
            description=f"{ok_count} de {len(entries)} alteração(ões) revertida(s).",
        )
        return ok_count, len(entries)
