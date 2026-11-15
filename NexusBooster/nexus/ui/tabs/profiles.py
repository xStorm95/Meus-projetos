"""Aba Perfis de Otimização: perfis por jogo + lista global de suspensão."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QVBoxLayout,
)

from nexus.games.profiles import BUILTIN_PROFILES, COMMON_SUSPEND, find_profile, get_profile
from nexus.ui import icons, theme
from nexus.ui.components import Card, Pill, SectionTitle, toast_for
from nexus.ui.tabs.base import BaseTab


class ProfilesTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)

        intro = Card("Perfis de otimização", "sliders")
        txt = QLabel(
            "Cada perfil define o que o boost faz naquele jogo: apps suspensos, plano "
            "de energia e recomendações reais de configuração. O Nexus Booster não "
            "promete FPS garantido — aplica apenas ajustes compatíveis com seu "
            "hardware e cada jogo."
        )
        txt.setWordWrap(True)
        txt.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        intro.body_layout().addWidget(txt)
        self.add(intro)

        # ------------------------------------------------------ global
        glob = Card("Comportamento global do boost", "settings")
        rows = [
            ("Ativar plano de energia de desempenho durante o boost", "power_on_boost"),
            ("Criar ponto de restauração antes de otimizações importantes", "restore_point_default"),
        ]
        self._toggles: dict[str, object] = {}
        from nexus.ui.components import ToggleSwitch

        for label, key in rows:
            row = QHBoxLayout()
            tg = ToggleSwitch(self.services.settings.get_bool(key))
            tg.toggled.connect(lambda on, k=key: self.services.settings.set(k, on))
            self._toggles[key] = tg
            row.addWidget(tg)
            l = QLabel(label)
            l.setStyleSheet(f"color: {theme.TEXT}; font-size: 13px;")
            row.addWidget(l)
            row.addStretch(1)
            glob.body_layout().addLayout(row)

        note = QLabel(
            "Apps suspensos durante o boost são configurados na aba Game Booster."
        )
        note.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        glob.body_layout().addWidget(note)
        self.add(glob)

        # ------------------------------------------------------ jogos com perfil
        games = self.services.db.games_all()
        matched = {}
        for g in games:
            prof = get_profile(g.profile_id)
            matched.setdefault(prof.id, []).append(g.name)

        for prof in BUILTIN_PROFILES:
            card = Card(prof.game_name, "gamepad")
            if prof.platform_note:
                pill = Pill(prof.platform_note, "muted")
                card.header_layout().addWidget(pill)
            has = matched.get(prof.id, [])
            if has:
                found = Pill(f"instalado ({len(has)})", "success")
                card.header_layout().addWidget(found)

            if prof.recommendations:
                rec_title = SectionTitle("Recomendações verificáveis")
                card.body_layout().addWidget(rec_title)
                for rec in prof.recommendations:
                    row = QHBoxLayout()
                    ic = QLabel()
                    ic.setPixmap(icons.pixmap("check", "success", 14))
                    row.addWidget(ic)
                    lbl = QLabel(rec)
                    lbl.setWordWrap(True)
                    lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
                    row.addWidget(lbl, 1)
                    host = QFrame()
                    host.setStyleSheet("background: transparent; border: none;")
                    host.setLayout(row)
                    card.body_layout().addWidget(host)

            if prof.launch_options:
                lt = SectionTitle("Parâmetros de inicialização opcionais")
                card.body_layout().addWidget(lt)
                for opt in prof.launch_options:
                    row = QHBoxLayout()
                    arg = QLabel(opt.arg)
                    arg.setStyleSheet(
                        f"color: {theme.ACCENT}; font-family: Consolas, monospace;"
                        "font-size: 12px; font-weight: 700; background: transparent;"
                    )
                    arg.setMinimumWidth(110)
                    row.addWidget(arg)
                    desc = QLabel(f"<b>{opt.label}</b> — {opt.description}")
                    desc.setWordWrap(True)
                    desc.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
                    row.addWidget(desc, 1)
                    host = QFrame()
                    host.setStyleSheet("background: transparent; border: none;")
                    host.setLayout(row)
                    card.body_layout().addWidget(host)

            if not prof.recommendations and not prof.launch_options:
                none = QLabel("Perfil genérico — boost padrão do Nexus Booster.")
                none.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 12px;")
                card.body_layout().addWidget(none)

            self.add(card)
