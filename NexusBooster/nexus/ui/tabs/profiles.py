"""Aba Perfis de Otimização: perfis por jogo + lista global de suspensão."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
)

from nexus.games.profiles import BUILTIN_PROFILES, get_profile
from nexus.ui import icons, theme
from nexus.ui.components import (
    Card,
    Pill,
    SectionTitle,
    ThemeLabel,
    ToggleSwitch,
)
from nexus.ui.tabs.base import BaseTab


class _Icon(QLabel):
    """Ícone simples reativo ao tema."""

    def __init__(self, name: str, color: str, size: int = 14, parent=None):
        super().__init__(parent)
        self._name, self._color, self._size = name, color, size
        self._apply()

    def _apply(self) -> None:
        self.setPixmap(icons.pixmap(self._name, self._color, self._size))

    def retheme(self) -> None:
        self._apply()


class ProfilesTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)

        intro = Card("Perfis de otimização", "sliders")
        txt = ThemeLabel(
            "Cada perfil define o que o boost faz naquele jogo: apps suspensos, plano "
            "de energia e recomendações reais de configuração. O DK não "
            "promete FPS garantido — aplica apenas ajustes compatíveis com seu "
            "hardware e cada jogo.",
            "body_sm", wrap=True,
        )
        intro.body_layout().addWidget(txt)
        self.add(intro)

        # ------------------------------------------------------ global
        glob = Card("Comportamento global do boost", "settings")
        rows = [
            ("Ativar plano de energia de desempenho durante o boost", "power_on_boost"),
            ("Criar ponto de restauração antes de otimizações importantes",
             "restore_point_default"),
        ]
        self._toggles: dict[str, object] = {}
        for label, key in rows:
            row = QHBoxLayout()
            tg = ToggleSwitch(self.services.settings.get_bool(key))
            tg.toggled.connect(lambda on, k=key: self.services.settings.set(k, on))
            self._toggles[key] = tg
            row.addWidget(tg)
            l = ThemeLabel(label, "body")
            row.addWidget(l)
            row.addStretch(1)
            glob.body_layout().addLayout(row)

        note = ThemeLabel(
            "Apps suspensos durante o boost são configurados na aba Game Booster.",
            "caption",
        )
        glob.body_layout().addWidget(note)
        self.add(glob)

        # ------------------------------------------ jogos com perfil (em thread)
        # cartões são montados na hora; o selo "instalado (N)" chega depois,
        # vindo do banco em thread separada — a aba abre sem travar
        cards: dict[str, Card] = {}
        for prof in BUILTIN_PROFILES:
            card = Card(prof.game_name, "gamepad")
            cards[prof.id] = card
            if prof.platform_note:
                card.header_layout().addWidget(Pill(prof.platform_note, "muted"))

            if prof.recommendations:
                card.body_layout().addWidget(SectionTitle("Recomendações verificáveis"))
                for rec in prof.recommendations:
                    row = QHBoxLayout()
                    row.addWidget(_Icon("check", "success"))
                    lbl = ThemeLabel(rec, "body_sm", wrap=True)
                    row.addWidget(lbl, 1)
                    host = QFrame()
                    host.setStyleSheet("background: transparent; border: none;")
                    host.setLayout(row)
                    card.body_layout().addWidget(host)

            if prof.launch_options:
                card.body_layout().addWidget(
                    SectionTitle("Parâmetros de inicialização opcionais")
                )
                for opt in prof.launch_options:
                    row = QHBoxLayout()
                    arg = ThemeLabel(opt.arg, "mono")
                    arg.setStyleSheet(
                        f"color: {theme.ACCENT_TEXT}; font-family: {theme.MONO_STACK};"
                        "font-size: 12px; font-weight: 700; background: transparent;"
                    )
                    arg.setMinimumWidth(110)
                    row.addWidget(arg)
                    desc = ThemeLabel(f"<b>{opt.label}</b> — {opt.description}",
                                      "caption", wrap=True)
                    desc.setTextFormat(Qt.TextFormat.RichText)
                    row.addWidget(desc, 1)
                    host = QFrame()
                    host.setStyleSheet("background: transparent; border: none;")
                    host.setLayout(row)
                    card.body_layout().addWidget(host)

            if not prof.recommendations and not prof.launch_options:
                card.body_layout().addWidget(
                    ThemeLabel("Perfil genérico — boost padrão do DK.",
                               "caption")
                )

            self.add(card)

        from nexus.core.worker import run_task

        def job():
            games = self.services.db.games_all()
            m: dict = {}
            for g in games:
                prof = get_profile(g.profile_id)
                m.setdefault(prof.id, []).append(g.name)
            return m

        def done(matched) -> None:
            for pid, names in (matched or {}).items():
                card = cards.get(pid)
                if card is not None and names:
                    card.header_layout().addWidget(
                        Pill(f"instalado ({len(names)})", "success"))

        run_task(job, done)
