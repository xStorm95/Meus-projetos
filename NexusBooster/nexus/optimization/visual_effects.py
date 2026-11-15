"""Efeitos visuais do Windows — ajustes reversíveis no registro (HKCU).

Cada ajuste é documentado, salvo no histórico e reversível individualmente.
Não mexe em fontes/ClearType nem em nada que exija reinstalação.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from nexus.system import registry_utils as reg

log = logging.getLogger("nexus.visual")


@dataclass
class VfxTweak:
    id: str
    label: str
    description: str
    path: str
    value_name: str
    off_value: object       # valor aplicado quando otimizado
    hive: str = "HKCU"
    on_default: object = None  # valor padrão do Windows (restauração)


TWEAKS: list[VfxTweak] = [
    VfxTweak(
        "transparency", "Transparência do Windows",
        "Desativa acrílico/transparência de janelas e barra de tarefas (Win10/11).",
        path=r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        value_name="EnableTransparency", off_value=0, on_default=1,
    ),
    VfxTweak(
        "taskbar_anim", "Animações da barra de tarefas",
        "Desativa animações da barra de tarefas e do menu Iniciar.",
        path=r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
        value_name="TaskbarAnimations", off_value=0, on_default=1,
    ),
    VfxTweak(
        "menu_delay", "Atraso de abertura de menus",
        "Reduz o atraso de abertura de menus de 400ms para 0ms.",
        path=r"Control Panel\Desktop",
        value_name="MenuShowDelay", off_value="0", on_default="400",
    ),
    VfxTweak(
        "min_animate", "Animar janelas ao minimizar",
        "Desativa a animação de minimizar/maximizar janelas.",
        path=r"Control Panel\Desktop\WindowMetrics",
        value_name="MinAnimate", off_value="0", on_default="1",
    ),
    VfxTweak(
        "listview_alpha", "Seleção translúcida no Explorador",
        "Remove a transparência de seleção de arquivos no Explorador.",
        path=r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
        value_name="ListviewAlphaSelect", off_value=0, on_default=1,
    ),
    VfxTweak(
        "listview_shadow", "Sombras em rótulos de ícones",
        "Remove sombras dos rótulos de ícones na área de trabalho.",
        path=r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
        value_name="ListviewShadow", off_value=0, on_default=1,
    ),
    VfxTweak(
        "icons_only", "Ícones em vez de miniaturas",
        "Mostra ícones em vez de miniaturas (economia leve de GPU).",
        path=r"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced",
        value_name="IconsOnly", off_value=1, on_default=0,
    ),
]


def current_states() -> dict[str, Optional[object]]:
    """Estado atual de cada ajuste (valor real do registro)."""
    states = {}
    for t in TWEAKS:
        try:
            states[t.id] = reg.read(t.hive, t.path, t.value_name, None)
        except reg.UnsupportedPlatform:
            states[t.id] = None
    return states


def is_applied(tweak: VfxTweak) -> bool:
    try:
        v = reg.read(tweak.hive, tweak.path, tweak.value_name, None)
    except reg.UnsupportedPlatform:
        return False
    return v is not None and str(v) == str(tweak.off_value)


def apply_tweaks(tweak_ids: list[str]) -> tuple[bool, str, dict]:
    """Aplica ajustes selecionados. Retorna (ok, msg, undo_payload)."""
    applied: dict[str, object] = {}
    failures: list[str] = []
    for t in TWEAKS:
        if t.id not in tweak_ids:
            continue
        try:
            before = reg.read(t.hive, t.path, t.value_name, None)
            if reg.write(t.hive, t.path, t.value_name, t.off_value):
                applied[t.id] = before if before is not None else t.on_default
            else:
                failures.append(t.label)
        except reg.UnsupportedPlatform:
            return False, "Disponível somente no Windows.", {}

    if not applied:
        return False, "Nenhum ajuste aplicado.", {}

    undo = {"tweaks": applied}
    msg = f"{len(applied)} ajuste(s) visuais aplicados."
    if failures:
        msg += f" Falhas: {', '.join(failures)} (execute como administrador)."
    log.info("efeitos visuais aplicados: %s", list(applied))
    return True, msg, undo


def restore(undo: dict) -> tuple[bool, str]:
    """Restaura valores anteriores dos ajustes."""
    tweaks = undo.get("tweaks", {})
    restored = 0
    for t in TWEAKS:
        if t.id in tweaks:
            value = tweaks[t.id]
            if value is None:
                value = t.on_default
            reg.write(t.hive, t.path, t.value_name, value)
            restored += 1
    if restored == 0:
        return False, "Nada para restaurar."
    log.info("efeitos visuais restaurados: %d", restored)
    return True, f"{restored} ajuste(s) visuais restaurados."


def notify_explorer() -> None:
    """Notifica o Explorer sobre mudanças (sem reiniciar o shell)."""
    from nexus.system import powershell as ps

    ps.run_ps(
        "$sig = '[DllImport(\"user32.dll\")] public static extern bool SendMessageTimeout("
        "IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);';"
        " $t = Add-Type -MemberDefinition $sig -Name Win32Send -PassThru;"
        " [IntPtr]$r = [IntPtr]::Zero;"
        " $t::SendMessageTimeout([IntPtr]0xffff, 0x001A, [IntPtr]::Zero, [IntPtr]::Zero, 2, 5000, [ref]$r)"
    )
