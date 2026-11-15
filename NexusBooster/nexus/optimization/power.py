"""Planos de energia do Windows — ativação de alto desempenho reversível."""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from nexus.system import powershell as ps

log = logging.getLogger("nexus.power")

HIGH_PERF_GUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
NEXUS_PLAN_NAME = "Nexus Booster — Desempenho"


@dataclass
class PowerPlan:
    guid: str
    name: str
    active: bool


def _powercfg(args: list[str]) -> tuple[bool, str]:
    return ps.run_cmd(["powercfg"] + args, timeout=20)


def list_plans() -> Optional[list[PowerPlan]]:
    ok, out = _powercfg(["/list"])
    if not ok:
        return None
    plans: list[PowerPlan] = []
    for line in out.splitlines():
        m = re.search(
            r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+(.*)",
            line,
        )
        if not m:
            continue
        guid, rest = m.group(1), m.group(2)
        active = "*" in rest
        name = rest.replace("*", "").strip()
        plans.append(PowerPlan(guid=guid, name=name, active=active))
    return plans or None


def current_plan() -> Optional[PowerPlan]:
    plans = list_plans()
    if not plans:
        return None
    for p in plans:
        if p.active:
            return p
    return None


def set_active(guid: str) -> tuple[bool, str]:
    """Ativa um plano pelo GUID (retorna ok, mensagem)."""
    ok, _ = _powercfg(["/setactive", guid])
    return ok, "Plano ativado." if ok else "Falha ao ativar (execute como administrador)."


def _find_or_create_nexus_plan() -> Optional[str]:
    plans = list_plans() or []
    for p in plans:
        if "nexus" in p.name.lower():
            return p.guid
    # Duplica o plano "Alto desempenho" (existe em todas as versões como GUID).
    ok, out = _powercfg(["-duplicatescheme", HIGH_PERF_GUID])
    if not ok:
        # Em alguns sistemas o alias é necessário
        ok, out = _powercfg(["-duplicatescheme", "scheme_min"])
        if not ok:
            return None
    m = re.search(
        r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        out,
    )
    if not m:
        return None
    new_guid = m.group(1)
    _powercfg(["/changename", new_guid, NEXUS_PLAN_NAME, "Plano criado pelo Nexus Booster"])
    log.info("plano de energia criado: %s", new_guid)
    return new_guid


def activate_performance() -> tuple[bool, str, dict]:
    """Ativa o plano de alto desempenho. Retorna (ok, msg, undo_payload)."""
    prev = current_plan()
    plans = list_plans() or []

    target: Optional[PowerPlan] = None
    for p in plans:
        low = p.name.lower()
        if "nexus" in low or "alto desempenho" in low or "high performance" in low or "ultimate" in low:
            target = p
            break

    if target is None:
        guid = _find_or_create_nexus_plan()
        if not guid:
            return False, "Não foi possível criar/ localizar um plano de alto desempenho.", {}
        ok, _ = _powercfg(["/setactive", guid])
        if not ok:
            return False, "Falha ao ativar o plano (execute como administrador).", {}
    else:
        if target.active:
            return True, f"Plano '{target.name}' já está ativo.", {}
        ok, _ = _powercfg(["/setactive", target.guid])
        if not ok:
            return False, "Falha ao ativar o plano (execute como administrador).", {}

    undo = {"previous_guid": prev.guid if prev else "", "previous_name": prev.name if prev else ""}
    name = target.name if target else NEXUS_PLAN_NAME
    return True, f"Plano de energia '{name}' ativado.", undo


def restore_plan(guid: str) -> tuple[bool, str]:
    if not guid:
        return False, "Plano anterior desconhecido."
    ok, _ = _powercfg(["/setactive", guid])
    if not ok:
        return False, "Falha ao restaurar o plano (execute como administrador)."
    return True, "Plano de energia anterior restaurado."
