"""Biblioteca de componentes visuais do DK (design system 2026).

Componentes pintados com QPainter (gráficos, cartões, toggles) e widgets
QSS-driven derivados dos tokens de tema — tudo reage em tempo real a
troca de tema/acento/densidade via ``theme.manager.changed``.
"""

from __future__ import annotations

import re
from collections import deque
from typing import Callable, Optional

from PySide6.QtCore import (
    QEasingCurve,
    QEvent,
    QPointF,
    QRectF,
    Qt,
    QObject,
    QTimer,
    QVariantAnimation,
    Signal,
)
from PySide6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QFontMetrics,
    QIcon,
    QLinearGradient,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
)
from PySide6.QtWidgets import (
    QGraphicsDropShadowEffect,
    QDialog,
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSlider,
    QVBoxLayout,
    QWidget,
)

from nexus.ui import icons, theme

# ---------------------------------------------------------------- helpers


def accent() -> QColor:
    return QColor(theme.ACCENT)


def muted() -> QColor:
    return QColor(theme.TEXT_MUTED)


def scaled_font(base: QFont, mult: float, bold: bool = False, min_pt: float = 7.0) -> QFont:
    """Fonte derivada de outra, tolerante a pointSize inválido (-1)."""
    f = QFont(base)
    ps = f.pointSizeF()
    if ps and ps > 0:
        f.setPointSizeF(max(min_pt, ps * mult))
    else:
        px = f.pixelSize()
        f.setPixelSize(max(int(min_pt * 10), int((px if px > 0 else 13) * mult)))
    if bold:
        f.setBold(True)
    return f


def px_font(size: int, weight: QFont.Weight = QFont.Weight.Normal) -> QFont:
    """Fonte da pilha padrão com tamanho em px lógicos."""
    f = QFont()
    f.setFamilies(["Segoe UI Variable Text", "Segoe UI", "Inter", "Noto Sans"])
    f.setPixelSize(size)
    f.setWeight(weight)
    return f


def bind_retheme(widget: QWidget, fn: Callable[[], None]) -> None:
    """Re-executa ``fn`` quando o tema muda (conexão morre com o widget)."""
    theme.manager.changed.connect(fn)


# --------------------------------------------------------------- ThemeLabel


_ROLES = {
    "display": (28, QFont.Weight.DemiBold, "text"),
    "title": (20, QFont.Weight.DemiBold, "text"),
    "title_sm": (16, QFont.Weight.DemiBold, "text"),
    "label": (13, QFont.Weight.DemiBold, "text"),
    "body": (13, QFont.Weight.Normal, "text"),
    "body_sm": (12, QFont.Weight.Normal, "text_muted"),
    "caption": (11, QFont.Weight.Normal, "text_faint"),
    "hint": (12, QFont.Weight.Normal, "text_muted"),
    "value": (20, QFont.Weight.DemiBold, "text"),
    "accent": (13, QFont.Weight.DemiBold, "accent"),
    "mono": (12, QFont.Weight.Medium, "text"),
}


class ThemeLabel(QLabel):
    """QLabel com papel tipográfico do design system, reativo ao tema."""

    def __init__(self, text: str = "", role: str = "body", parent=None, wrap: bool = False):
        super().__init__(text, parent)
        self._role = role
        self.setWordWrap(wrap)
        self._apply()

    def set_role(self, role: str) -> None:
        self._role = role
        self._apply()

    def _apply(self) -> None:
        size, weight, color_key = _ROLES.get(self._role, _ROLES["body"])
        color = {
            "text": theme.TEXT,
            "text_muted": theme.TEXT_MUTED,
            "text_faint": theme.TEXT_FAINT,
            "accent": theme.ACCENT_TEXT,
        }.get(color_key, theme.TEXT)
        mono = self._role == "mono"
        family = theme.MONO_STACK if mono else theme.FONT_STACK
        self.setStyleSheet(
            f"color: {color}; font-family: {family}; font-size: {size}px;"
            f"font-weight: {int(weight)}; background: transparent;"
        )

    def retheme(self) -> None:
        self._apply()


class SectionTitle(QLabel):
    """Rótulo de seção — caixa alta, secundário (compatível com o existente)."""

    def __init__(self, text: str, parent=None):
        super().__init__(text.upper(), parent)
        self._apply()

    def _apply(self) -> None:
        self.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; font-weight: 700;"
            f"letter-spacing: 1.2px; background: transparent;"
        )

    def retheme(self) -> None:
        self._apply()


# -------------------------------------------------------------------- Card


class _GlowFilter(QObject):
    """Liga/desliga um brilho neon suave conforme o hover do widget."""

    def __init__(self, target, radius: int, color_fn):
        super().__init__(target)
        self._color_fn = color_fn
        self._effect = QGraphicsDropShadowEffect(target)
        self._effect.setBlurRadius(radius)
        self._effect.setOffset(0, 0)
        self._effect.setEnabled(False)
        target.setGraphicsEffect(self._effect)
        target.installEventFilter(self)

    def eventFilter(self, obj, ev) -> bool:
        t = ev.type()
        if t == QEvent.Type.HoverEnter:
            self._set_on(True)
        elif t in (QEvent.Type.HoverLeave, QEvent.Type.Hide):
            self._set_on(False)
        return False

    def _set_on(self, on: bool) -> None:
        if on and theme.reduce_motion():
            on = False
        if on:
            c = QColor(self._color_fn())
            c.setAlpha(140)
            self._effect.setColor(c)
        self._effect.setEnabled(on)


def hover_glow(widget, radius: int = 24, color_fn=None) -> None:
    """Brilho neon no hover — desativado quando "reduzir animações" está ligado."""
    if color_fn is None:
        color_fn = lambda: theme.ACCENT
    _GlowFilter(widget, radius, color_fn)


class Card(QFrame):
    """Superfície de cartão: título + ação opcional + corpo (layout vertical).

    Compatível com a API anterior: ``Card(title, icon_name, parent, neon=)`` —
    o parâmetro ``neon`` é aceito por compatibilidade (design novo: borda 1px).
    """

    def __init__(self, title: str = "", icon_name: str = "", parent=None, neon: bool = True):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        self.setStyleSheet("QFrame { background: transparent; border: none; }")
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(theme.pad("lg"), theme.pad("md"),
                                        theme.pad("lg"), theme.pad("lg"))
        self._layout.setSpacing(theme.pad("sm"))

        self._header = QHBoxLayout()
        self._header.setSpacing(theme.pad("sm"))
        self._icon_label: Optional[QLabel] = None
        if icon_name:
            self._icon_label = QLabel()
            self._icon_label.setPixmap(icons.pixmap(icon_name, "accent_text", 18))
            self._header.addWidget(self._icon_label)
        self._title_label: Optional[ThemeLabel] = None
        if title:
            self._title_label = ThemeLabel(title, "label")
            self._header.addWidget(self._title_label)
        self._header.addStretch(1)
        self._layout.addLayout(self._header)
        bind_retheme(self, self._retheme)
        # cartões ganham um brilho neon sutil ao receber o mouse
        hover_glow(self, 20)

    def _retheme(self) -> None:
        if self._icon_label is not None:
            pm = self._icon_label.pixmap()
            size = pm.width() if pm else 18
            name = getattr(self, "_icon_name", "")
            if name:
                self._icon_label.setPixmap(icons.pixmap(name, "accent_text", size))
        self.update()

    def set_icon(self, icon_name: str) -> None:
        self._icon_name = icon_name
        if self._icon_label is None:
            self._icon_label = QLabel()
            self._header.insertWidget(0, self._icon_label)
        self._icon_label.setPixmap(icons.pixmap(icon_name, "accent_text", 18))

    def header_layout(self) -> QHBoxLayout:
        return self._header

    def body_layout(self) -> QVBoxLayout:
        return self._layout

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)
        radius = float(theme.RADIUS["card"])
        path = QPainterPath()
        path.addRoundedRect(rect, radius, radius)
        p.fillPath(path, QColor(theme.CARD))
        pen = QPen(QColor(theme.BORDER), 1.0)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(rect, radius, radius)
        p.end()


class HeroCard(Card):
    """Painel de boas-vindas com a marca ao fundo (discreta) — raio de painel."""

    def __init__(self, image_name: str = "brand.jpg", title: str = "", icon_name: str = "",
                 parent=None):
        super().__init__(title, icon_name, parent)
        self._pm = QPixmap()
        from nexus.core.paths import asset_path

        # prioridade: ícone oficial da marca (assets/icon.png)
        icon_file = asset_path("icon.png")
        if icon_file.is_file():
            self._pm.load(str(icon_file))
        if self._pm.isNull():
            p = asset_path(image_name)
            if p.is_file():
                self._pm.load(str(p))

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        radius = float(theme.RADIUS["panel"])
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)
        path = QPainterPath()
        path.addRoundedRect(rect, radius, radius)
        p.fillPath(path, QColor(theme.CARD))

        if not self._pm.isNull():
            w, h = self.width(), self.height()
            iw, ih = self._pm.width(), self._pm.height()
            target_h = h * 1.15
            target_w = target_h * (iw / ih)
            target = QRectF(w - target_w * 0.62, (h - target_h) / 2, target_w, target_h)
            p.save()
            p.setClipPath(path)
            p.setOpacity(0.30 if theme.MODE == "dark" else 0.22)
            p.drawPixmap(target.toRect(), self._pm)
            p.restore()
            # esmaece em direção ao conteúdo
            fade = QLinearGradient(QPointF(w * 0.45, 0), QPointF(w * 0.98, 0))
            base = QColor(theme.CARD)
            fade.setColorAt(0.0, QColor(base.red(), base.green(), base.blue(), 255))
            fade.setColorAt(0.6, QColor(base.red(), base.green(), base.blue(), 216))
            fade.setColorAt(1.0, QColor(base.red(), base.green(), base.blue(), 150))
            p.save()
            p.setClipPath(path)
            p.fillRect(rect, QBrush(fade))
            p.restore()

        pen = QPen(QColor(theme.BORDER), 1.0)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(rect, radius, radius)
        p.end()


# ----------------------------------------------------------------- Pill/Badge


_RISK_KINDS = {"baixo": "success", "médio": "warning", "medio": "warning", "alto": "danger"}


def risk_kind(risk: str) -> str:
    return _RISK_KINDS.get(risk.strip().lower(), "muted")


class Pill(QLabel):
    """Chip compacto com cor semântica E texto (nunca só cor)."""

    def __init__(self, text: str = "", kind: str = "muted", parent=None):
        super().__init__(text, parent)
        self._kind = kind
        self.set_kind(kind)

    def set_kind(self, kind: str) -> None:
        self._kind = kind
        self._apply()

    def _apply(self) -> None:
        pairs = {
            "accent": (theme.ACCENT_TEXT, theme.with_alpha(theme.ACCENT, 26),
                       theme.with_alpha(theme.ACCENT, 90)),
            "success": (theme.SUCCESS, theme.token("success_bg"), theme.SUCCESS),
            "warning": (theme.WARNING, theme.token("warning_bg"), theme.WARNING),
            "danger": (theme.DANGER, theme.token("danger_bg"), theme.DANGER),
            "info": (theme.token("info"), theme.token("info_bg"), theme.token("info")),
            "muted": (theme.TEXT_MUTED, theme.SURFACE1, theme.BORDER_STRONG),
        }
        fg, bg, border = pairs.get(self._kind, pairs["muted"])
        self.setStyleSheet(
            f"color: {fg}; background: {bg}; border: 1px solid {border};"
            "border-radius: 9px; padding: 2px 10px; font-size: 11px; font-weight: 600;"
        )
        self.adjustSize()

    def retheme(self) -> None:
        self._apply()


Badge = Pill  # alias semântico


# ------------------------------------------------------------------ Button


class Button(QPushButton):
    """Botão do design system: primary | secondary | subtle | danger.

    Suporta ícone por nome e estado ``loading`` (spinner + desabilitado).
    """

    def __init__(self, text: str = "", variant: str = "secondary", icon_name: str = "",
                 parent=None, dangerous: bool = False):
        super().__init__(text, parent)
        self._variant = "danger" if dangerous else variant
        self._icon_name = icon_name
        self._loading = False
        self._backup_text = text
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setProperty("variant", self._variant)
        self._spinner = None
        self._apply_icon()
        # botões de destaque ganham brilho neon no hover
        if self._variant == "primary":
            hover_glow(self, 24)
        elif self._variant == "danger":
            hover_glow(self, 24, lambda: theme.DANGER)

    def _apply_icon(self) -> None:
        if self._loading:
            return
        if self._icon_name:
            on_primary = self._variant == "primary"
            color = "on_accent" if on_primary else (
                "danger" if self._variant == "danger" else "accent_text"
            )
            self.setIcon(icons.icon(self._icon_name, color, 16))
        else:
            self.setIcon(QIcon())

    def set_variant(self, variant: str) -> None:
        self._variant = variant
        self.setProperty("variant", variant)
        st = self.style()
        if st is not None:
            st.unpolish(self)
            st.polish(self)
        self._apply_icon()

    def set_icon(self, icon_name: str) -> None:
        self._icon_name = icon_name
        self._apply_icon()

    def set_loading(self, loading: bool, text: str = "") -> None:
        if loading == self._loading:
            return
        self._loading = loading
        if loading:
            self._backup_text = self.text()
            self.setText(text or self._backup_text)
            self.setEnabled(False)
            from nexus.ui.components import Spinner

            if self._spinner is None:
                self._spinner = Spinner(16, self)
            self._spinner.start()
            self.setIcon(QIcon())
            # reposiciona o spinner à direita do texto
            self._spinner.raise_()
        else:
            self.setText(self._backup_text)
            self.setEnabled(True)
            if self._spinner is not None:
                self._spinner.stop()
                self._spinner.hide()
            self._apply_icon()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if self._spinner is not None and self._spinner.isVisible():
            self._spinner.move(self.width() - 26, (self.height() - 16) // 2)

    def retheme(self) -> None:
        self._apply_icon()


# ------------------------------------------------------------- SearchBox


class SearchBox(QLineEdit):
    """Campo de busca com lupa embutida."""

    def __init__(self, placeholder: str = "", parent=None):
        super().__init__(parent)
        self.setPlaceholderText(placeholder)
        self.setClearButtonEnabled(True)
        action = self.addAction(icons.icon("search", "muted", 16),
                                 QLineEdit.ActionPosition.LeadingPosition)
        self._search_action = action
        bind_retheme(self, self._retint)

    def _retint(self) -> None:
        self._search_action.setIcon(icons.icon("search", "muted", 16))


class Slider(QSlider):
    """QSlider com cursor de mão e estilo do tema (QSS global cobre o visual)."""

    def __init__(self, orientation: Qt.Orientation, parent=None):
        super().__init__(orientation, parent)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)


# -------------------------------------------------------- SegmentedControl


class SegmentedControl(QFrame):
    """Seletor segmentado (ex.: Escuro | Claro | Sistema)."""

    changed = Signal(str)

    def __init__(self, items: list[tuple[str, str]], current: str = "", parent=None):
        super().__init__(parent)
        self._ids: list[str] = []
        lay = QHBoxLayout(self)
        lay.setContentsMargins(3, 3, 3, 3)
        lay.setSpacing(2)
        self._buttons: dict[str, QPushButton] = {}
        for item_id, label in items:
            self._ids.append(item_id)
            btn = QPushButton(label)
            btn.setCheckable(True)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _=False, i=item_id: self._select(i))
            btn.setFocusPolicy(Qt.FocusPolicy.TabFocus)
            self._buttons[item_id] = btn
            lay.addWidget(btn)
        self._current = ""
        self._apply()
        self._select(current or (self._ids[0] if self._ids else ""))

    def _select(self, item_id: str) -> None:
        if item_id not in self._buttons or item_id == self._current:
            return
        self._current = item_id
        for iid, btn in self._buttons.items():
            btn.setChecked(iid == item_id)
        self.changed.emit(item_id)

    def set_current(self, item_id: str) -> None:
        if item_id in self._buttons and item_id != self._current:
            self._current = item_id
            for iid, btn in self._buttons.items():
                btn.setChecked(iid == item_id)

    def current(self) -> str:
        return self._current

    def _apply(self) -> None:
        self.setStyleSheet(
            f"""
            SegmentedControl {{
                background: {theme.SURFACE1}; border: 1px solid {theme.BORDER};
                border-radius: {theme.RADIUS['control']}px;
            }}
            QPushButton {{
                background: transparent; border: 1px solid transparent;
                border-radius: 6px; padding: 5px 14px; font-weight: 600;
                color: {theme.TEXT_MUTED};
            }}
            QPushButton:checked {{
                background: {theme.CARD}; color: {theme.ACCENT_TEXT};
                border: 1px solid {theme.BORDER_STRONG};
            }}
            QPushButton:focus {{ border: 2px solid {theme.with_alpha(theme.ACCENT, 160)}; }}
            """
        )

    def retheme(self) -> None:
        self._apply()


# ---------------------------------------------------------------- StatTile


class StatTile(QFrame):
    """Bloco de métrica: ícone + valor grande + rótulo + sub/delta + sparkline."""

    def __init__(self, icon_name: str, label: str, value: str = "—",
                 sub: str = "", color: str = "accent", parent=None,
                 clickable: bool = False):
        super().__init__(parent)
        self._icon_name = icon_name
        self._color = color
        self._clickable = clickable
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        self.setStyleSheet("QFrame { background: transparent; border: none; }")
        self.setCursor(Qt.CursorShape.PointingHandCursor if clickable
                       else Qt.CursorShape.ArrowCursor)

        lay = QHBoxLayout(self)
        lay.setContentsMargins(theme.pad("md"), theme.pad("sm") + 2,
                               theme.pad("md"), theme.pad("sm") + 2)
        lay.setSpacing(theme.pad("md"))

        self._ic = QLabel()
        self._ic.setPixmap(icons.pixmap(icon_name, color, 22))
        lay.addWidget(self._ic, 0, Qt.AlignmentFlag.AlignTop)

        col = QVBoxLayout()
        col.setSpacing(1)
        self._value = ThemeLabel(value, "value")
        col.addWidget(self._value)
        self._label = ThemeLabel(label, "body_sm")
        col.addWidget(self._label)
        self._spark: Optional[Sparkline] = None
        lay.addLayout(col, 1)

        self._sub = ThemeLabel(sub, "caption")
        self._sub.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        lay.addWidget(self._sub)

        self._apply()
        bind_retheme(self, self._apply)

    def _apply(self) -> None:
        self._ic.setPixmap(icons.pixmap(self._icon_name, self._color, 22))
        self.update()

    _NUM_RE = re.compile(r"^(\D*?)(-?\d+(?:[.,]\d+)?)(.*)$")

    def set_value(self, value: str, sub: str = "") -> None:
        self._roll_to(value)
        if sub or sub == "":
            self._sub.setText(sub)

    def _roll_to(self, value: str) -> None:
        """Anima a troca do número (roll rápido) para dar vida ao painel."""
        old = self._value.text()
        if theme.dur("fast") <= 0 or old == value:
            self._value.setText(value)
            return
        mo, mn = self._NUM_RE.match(old), self._NUM_RE.match(value)
        if (not mo or not mn or mo.group(1) != mn.group(1)
                or mo.group(3) != mn.group(3)):
            self._value.setText(value)  # prefixo/sufixo mudou: troca direta
            return
        try:
            a = float(mo.group(2).replace(",", "."))
            b = float(mn.group(2).replace(",", "."))
        except ValueError:
            self._value.setText(value)
            return
        if a == b:
            self._value.setText(value)
            return
        num = mn.group(2)
        if "." in num or "," in num:
            sep = "," if "," in num else "."
            dec = len(num.replace(",", ".").split(".")[1])
        else:
            sep, dec = "", 0
        anim = QVariantAnimation(self)
        anim.setDuration(theme.dur("fast"))
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.setStartValue(a)
        anim.setEndValue(b)

        def tick(v) -> None:
            s = f"{v:.{dec}f}"
            if sep == ",":
                s = s.replace(".", ",")
            self._value.setText(mn.group(1) + s + mn.group(3))

        anim.valueChanged.connect(tick)
        anim.finished.connect(lambda: self._value.setText(value))
        anim.start()
        self._roll = anim  # guarda referência para não ser coletado

    def set_color(self, color: str) -> None:
        self._color = color
        self._apply()

    def set_sub_color(self, semantic: str) -> None:
        color = {"success": theme.SUCCESS, "warning": theme.WARNING,
                 "danger": theme.DANGER, "accent": theme.ACCENT_TEXT}.get(semantic)
        if color:
            self._sub.setStyleSheet(
                f"color: {color}; font-size: 11px; background: transparent;"
            )

    def add_sparkline(self, color: str = "accent") -> "Sparkline":
        if self._spark is None:
            self._spark = Sparkline(color)
            self.layout().itemAt(1).layout().addWidget(self._spark)
        return self._spark

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        radius = float(theme.RADIUS["card"])
        rect = QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5)
        path = QPainterPath()
        path.addRoundedRect(rect, radius, radius)
        p.fillPath(path, QColor(theme.CARD))
        border = theme.BORDER_STRONG if self._hover else theme.BORDER
        p.setPen(QPen(QColor(border), 1.0))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(rect, radius, radius)
        p.end()

    _hover = False

    def enterEvent(self, event) -> None:
        self._hover = True
        self.update()
        super().enterEvent(event)

    def leaveEvent(self, event) -> None:
        self._hover = False
        self.update()
        super().leaveEvent(event)


# --------------------------------------------------------------- Sparkline


class Sparkline(QFrame):
    """Mini gráfico de linha (janela deslizante) para StatTiles."""

    def __init__(self, color: str = "accent", parent=None, max_points: int = 60):
        super().__init__(parent)
        self._color = color
        self._data: deque = deque(maxlen=max_points)
        self.setFixedHeight(26)
        self.setMinimumWidth(70)
        self.setStyleSheet("background: transparent; border: none;")
        bind_retheme(self, self.update)

    def push(self, value: Optional[float]) -> None:
        self._data.append(value)
        self.update()

    def set_data(self, values: list) -> None:
        self._data.clear()
        for v in values[-self._data.maxlen:]:
            self._data.append(v)
        self.update()

    def paintEvent(self, event) -> None:
        if not self._data:
            return
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        pts_data = [v for v in self._data if v is not None]
        if not pts_data:
            return
        top = max(1.0, max(pts_data) * 1.15)
        n = len(self._data)
        color = QColor(self._color if str(self._color).startswith("#") else theme.ACCENT)
        pts: list[QPointF] = []
        for i, v in enumerate(self._data):
            if v is None:
                continue
            x = 1 + (w - 2) * (i / max(1, n - 1))
            y = (h - 3) - (h - 6) * (min(v, top) / top)
            pts.append(QPointF(x, y))
        if len(pts) < 2:
            p.setPen(QPen(color, 1.75, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
            p.drawPoint(pts[0])
            p.end()
            return
        path = QPainterPath()
        path.moveTo(pts[0])
        for pt in pts[1:]:
            path.lineTo(pt)
        fill = QPainterPath(path)
        fill.lineTo(pts[-1].x(), h)
        fill.lineTo(pts[0].x(), h)
        fill.closeSubpath()
        grad = QLinearGradient(0, 0, 0, h)
        grad.setColorAt(0, QColor(color.red(), color.green(), color.blue(), 60))
        grad.setColorAt(1, QColor(color.red(), color.green(), color.blue(), 0))
        p.fillPath(fill, QBrush(grad))
        p.setPen(QPen(color, 1.75, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.drawPath(path)
        p.end()


# ----------------------------------------------------------------- MiniBar


class MiniBar(QFrame):
    """Barrinha horizontal compacta (células de tabela: CPU/RAM)."""

    def __init__(self, percent: float = 0.0, warn_at: float = 75.0, parent=None):
        super().__init__(parent)
        self._pct = max(0.0, min(100.0, percent))
        self._warn = warn_at
        self.setFixedSize(64, 6)
        self.setStyleSheet("background: transparent; border: none;")
        bind_retheme(self, self.update)

    def set_value(self, percent: float) -> None:
        self._pct = max(0.0, min(100.0, percent))
        self.update()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r = QRectF(0.5, 1.0, self.width() - 1, self.height() - 2)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(theme.BORDER_STRONG))
        p.drawRoundedRect(r, 2.5, 2.5)
        if self._pct > 0.5:
            if self._pct >= 95:
                color = QColor(theme.DANGER)
            elif self._pct >= self._warn:
                color = QColor(theme.WARNING)
            else:
                color = accent()
            w = (self.width() - 1) * self._pct / 100.0
            p.setBrush(color)
            p.drawRoundedRect(QRectF(0.5, 1.0, w, self.height() - 2), 2.5, 2.5)
        p.end()


class BarMeter(QFrame):
    """Barra com rótulo e valor (uso em listas/linhas de resumo)."""

    def __init__(self, label: str = "", suffix: str = "", parent=None):
        super().__init__(parent)
        self._pct = 0.0
        self._label = label
        self._suffix = suffix
        self.setFixedHeight(30)
        self.setStyleSheet("background: transparent; border: none;")
        bind_retheme(self, self.update)

    def set_value(self, pct: float) -> None:
        self._pct = max(0.0, min(100.0, pct))
        self.update()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        p.setFont(px_font(11, QFont.Weight.Normal))
        p.setPen(QColor(theme.TEXT_MUTED))
        p.drawText(QRectF(0, 0, w - 46, 14), Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter, self._label)
        p.setPen(QColor(theme.TEXT))
        p.drawText(QRectF(w - 46, 0, 46, 14), Qt.AlignmentFlag.AlignRight, f"{self._pct:.0f}{self._suffix}")
        track = QRectF(0.5, 19, w - 1, 6)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(theme.BORDER))
        p.drawRoundedRect(track, 3, 3)
        if self._pct > 0.5:
            color = QColor(theme.WARNING if self._pct >= 85 else theme.ACCENT)
            p.setBrush(color)
            p.drawRoundedRect(QRectF(0.5, 19, (w - 1) * self._pct / 100.0, 6), 3, 3)
        p.end()


class ProportionBar(QFrame):
    """Barra de proporção segmentada (ex.: espaço por categoria de limpeza)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._segments: list[tuple[str, float]] = []
        self.setFixedHeight(30)
        self.setStyleSheet("background: transparent; border: none;")
        bind_retheme(self, self.update)

    def set_segments(self, segments: list[tuple[str, float]]) -> None:
        self._segments = segments
        self.update()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        if not self._segments:
            track = QRectF(0.5, 12, w - 1, 6)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(theme.BORDER))
            p.drawRoundedRect(track, 3, 3)
            p.setPen(QColor(theme.TEXT_FAINT))
            p.setFont(px_font(11))
            p.drawText(QRectF(0, 0, w, 12), Qt.AlignmentFlag.AlignLeft, "sem dados")
            p.end()
            return
        total = sum(v for _, v in self._segments) or 1.0
        colors = [theme.ACCENT, theme.SUCCESS, theme.token("info"),
                  theme.WARNING, theme.DANGER, theme.TEXT_MUTED]
        x = 0.0
        bar_h = 6.0
        y = 12.0
        p.setPen(Qt.PenStyle.NoPen)
        for i, (label, value) in enumerate(self._segments):
            seg_w = (w - 1) * (value / total)
            color = QColor(colors[i % len(colors)])
            if seg_w > 0.5:
                p.setBrush(color)
                p.drawRoundedRect(QRectF(x, y, seg_w - 1, bar_h), 3, 3)
            x += seg_w
        # legenda
        lx = 0.0
        p.setFont(px_font(10))
        for i, (label, value) in enumerate(self._segments[:6]):
            color = QColor(colors[i % len(colors)])
            p.setBrush(color)
            p.setPen(Qt.PenStyle.NoPen)
            p.drawEllipse(QPointF(lx + 3, 25), 2.5, 2.5)
            p.setPen(QColor(theme.TEXT_MUTED))
            txt = f"{label}"
            p.drawText(QRectF(lx + 9, 18, 160, 14), Qt.AlignmentFlag.AlignLeft, txt)
            fm = QFontMetrics(p.font())
            lx += 9 + fm.horizontalAdvance(txt) + 14
            if lx > w - 80:
                break
        p.end()


# ------------------------------------------------------------- GaugeRing


class GaugeRing(QFrame):
    """Anel de progresso (0–100) com texto central.

    Atualizações de monitoramento (mesmo alvo ou variação pequena) aplicam
    ajuste rápido de 120ms; a animação completa só ocorre na primeira leitura
    ou em saltos grandes — o número sempre assenta num valor estável.
    """

    def __init__(self, label: str = "", suffix: str = "%", parent=None,
                 size: int = 150, warn_at: float = 85.0):
        super().__init__(parent)
        self._value = 0.0
        self._display = 0.0
        self._label = label
        self._suffix = suffix
        self._warn_at = warn_at
        self._sub = ""
        self._target: Optional[float] = None
        self.setFixedSize(size, size)
        self._anim = QVariantAnimation(self)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(self._on_anim)
        bind_retheme(self, self.update)

    def set_value(self, value: Optional[float], sub: str = "") -> None:
        self._sub = sub or ("não suportado" if value is None else self._sub)
        if value is None:
            self._target = None
            self.update()
            return
        new = float(value)
        first = self._target is None
        prev = self._target if self._target is not None else self._display
        self._target = new
        self._sub = sub or self._sub

        # mesmo valor (±0.5): apenas garante o estado final, sem animar
        if abs(new - self._display) <= 0.5 and not first:
            self._anim.stop()
            self._display = new
            self.update()
            return

        d = theme.dur("fast")
        if d <= 0:
            self._display = new
            self.update()
            return
        # primeira leitura ou salto grande → animação completa;
        # fluxo contínuo do monitor → ajuste rápido e discreto
        big_jump = first or abs(new - prev) > 25.0
        self._anim.stop()
        self._anim.setDuration(420 if big_jump else max(90, int(d * 0.75)))
        self._anim.setStartValue(self._display)
        self._anim.setEndValue(new)
        self._anim.start()
        self.update()

    def _on_anim(self, v: float) -> None:
        self._display = v
        self.update()

    def _value_color(self) -> str:
        if self._target is None:
            return theme.TEXT
        if self._target >= 95:
            return theme.DANGER
        if self._target >= self._warn_at:
            return theme.WARNING
        return theme.TEXT

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        m = 11.0
        rect = QRectF(m, m, w - 2 * m, h - 2 * m)
        pen_w = 8.0
        start = 225 * 16
        span = -270 * 16

        # trilho
        p.setPen(QPen(QColor(theme.BORDER_STRONG), pen_w, Qt.PenStyle.SolidLine,
                      Qt.PenCapStyle.RoundCap))
        p.drawArc(rect, start, span)

        if self._target is not None:
            ratio = max(0.0, min(100.0, self._display)) / 100.0
            if self._display >= 95:
                color = QColor(theme.DANGER)
            elif self._display >= self._warn_at:
                color = QColor(theme.WARNING)
            else:
                color = accent()
            p.setPen(QPen(color, pen_w, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
            p.drawArc(rect, start, int(span * ratio))

        # textos — value centrado acima do centro; label e sub bem separados
        p.setPen(QColor(self._value_color()))
        p.setFont(px_font(max(14, int(w * 0.16)), QFont.Weight.DemiBold))
        if self._target is None:
            p.drawText(QRectF(0, h * 0.28, w, h * 0.30),
                       Qt.AlignmentFlag.AlignCenter, "N/D")
        else:
            p.drawText(QRectF(0, h * 0.28, w, h * 0.30), Qt.AlignmentFlag.AlignCenter,
                       f"{self._display:.0f}{self._suffix}")
        p.setPen(QColor(theme.TEXT_MUTED))
        p.setFont(px_font(max(10, int(w * 0.085))))
        p.drawText(QRectF(0, h * 0.58, w, h * 0.16), Qt.AlignmentFlag.AlignHCenter,
                   self._label)
        if self._sub:
            p.setPen(QColor(theme.TEXT_FAINT))
            p.setFont(px_font(max(9, int(w * 0.075))))
            p.drawText(QRectF(0, h * 0.73, w, h * 0.16), Qt.AlignmentFlag.AlignHCenter,
                       self._sub)
        p.end()


# -------------------------------------------------------------- LineChart


class LineChart(QFrame):
    """Gráfico de linhas em tempo real, múltiplas séries, pintado à mão."""

    def __init__(self, unit: str = "%", max_points: int = 120, fixed_max: float = 100.0,
                 show_grid: bool = True, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(150)
        self._unit = unit
        self._max = fixed_max
        self._fixed = fixed_max is not None
        self._grid = show_grid
        self._max_points = max_points
        self._series: dict[str, deque] = {}
        self._colors: dict[str, str] = {}
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        self.setStyleSheet("QFrame { background: transparent; border: none; }")
        bind_retheme(self, self.update)

    def add_series(self, name: str, color: str = "accent") -> None:
        self._series[name] = deque(maxlen=self._max_points)
        self._colors[name] = color

    def push(self, name: str, value: Optional[float]) -> None:
        if name not in self._series:
            self.add_series(name)
        self._series[name].append(value)
        self.update()

    def set_values(self, name: str, values: list) -> None:
        if name not in self._series:
            self.add_series(name)
        self._series[name].clear()
        self._series[name].extend(values[-self._max_points:])

    def clear(self) -> None:
        for d in self._series.values():
            d.clear()
        self.update()

    def current_max(self) -> float:
        vals = [v for d in self._series.values() for v in d if v is not None]
        return max(vals) if vals else 0.0

    def _series_color(self, name: str) -> QColor:
        raw = self._colors.get(name, theme.ACCENT)
        if str(raw).startswith("#"):
            return QColor(raw)
        named = {
            "accent": theme.ACCENT,
            "success": theme.SUCCESS,
            "warning": theme.WARNING,
            "danger": theme.DANGER,
            "info": theme.token("info"),
        }
        return QColor(named.get(str(raw), theme.ACCENT))

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        pad_l, pad_r, pad_t, pad_b = 4.0, 56.0, 10.0, 8.0

        top = self._max if self._fixed else max(1.0, self.current_max() * 1.25)
        inner_w = w - pad_l - pad_r
        inner_h = h - pad_t - pad_b

        # grade horizontal sutil
        if self._grid:
            p.setPen(QPen(QColor(theme.BORDER), 1))
            for i in range(4):
                y = pad_t + inner_h * i / 3
                p.drawLine(QPointF(pad_l, y), QPointF(w - pad_r, y))

        # retângulos dos rótulos da escala (desenhados depois, evitando pílulas)
        scale_rects: list[tuple[QRectF, str]] = []
        for i in range(4):
            val = top * (1 - i / 3)
            label = f"{val:.0f}" if val >= 10 or val == 0 else f"{val:.1f}"
            scale_rects.append((
                QRectF(w - pad_r + 6, pad_t + inner_h * i / 3 - 7, pad_r - 10, 14),
                label,
            ))

        # pílulas de valor atual — posição do último ponto de cada série,
        # SEMPRE na faixa da escala (fora da área de desenho da linha).
        pill_h = 17.0
        pill_rects: list[tuple[QRectF, str, QColor]] = []
        for name, data in self._series.items():
            if not data or data[-1] is None:
                continue
            y = pad_t + inner_h * (1 - min(data[-1], top) / top)
            rect = QRectF(w - pad_r + 2, 0.0, pad_r - 6, pill_h)
            rect.moveCenter(QPointF(rect.center().x(), y))
            if rect.top() < pad_t:
                rect.moveTop(pad_t)
            if rect.bottom() > h - pad_b:
                rect.moveBottom(h - pad_b)
            txt = f"{data[-1]:.0f}" if self._unit == "%" else f"{data[-1]:.1f}"
            pill_rects.append((rect, txt, self._series_color(name)))

        # desempilha pílulas que colidem entre si (duas séries próximas)
        pill_rects.sort(key=lambda t: t[0].center().y())
        for i in range(1, len(pill_rects)):
            rect, txt, color = pill_rects[i]
            prev = pill_rects[i - 1][0]
            if rect.top() < prev.bottom() + 2:
                rect.moveTop(prev.bottom() + 2)
                if rect.bottom() > h - pad_b:
                    rect.moveBottom(h - pad_b)
                pill_rects[i] = (rect, txt, color)

        # séries
        legend_x = pad_l + 2
        legend_y = pad_t + 4
        for name, data in self._series.items():
            color = self._series_color(name)
            n = len(data)
            pts: list[QPointF] = []
            if n:
                for i, v in enumerate(data):
                    if v is None:
                        continue
                    x = pad_l + inner_w * ((self._max_points - n + i) / (self._max_points - 1.0))
                    y = pad_t + inner_h * (1 - min(v, top) / top)
                    pts.append(QPointF(x, y))
            if len(pts) >= 2:
                path = QPainterPath()
                path.moveTo(pts[0])
                for pt in pts[1:]:
                    path.lineTo(pt)
                fill = QPainterPath(path)
                fill.lineTo(pts[-1].x(), pad_t + inner_h)
                fill.lineTo(pts[0].x(), pad_t + inner_h)
                fill.closeSubpath()
                grad = QLinearGradient(0, pad_t, 0, pad_t + inner_h)
                grad.setColorAt(0, QColor(color.red(), color.green(), color.blue(), 36))
                grad.setColorAt(1, QColor(color.red(), color.green(), color.blue(), 0))
                p.fillPath(fill, QBrush(grad))
                p.setPen(QPen(color, 2.0, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
                p.drawPath(path)
            elif len(pts) == 1:
                p.setPen(QPen(color, 2.0, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
                p.drawPoint(pts[0])

            # marcador do último ponto
            if pts:
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(color)
                p.drawEllipse(pts[-1], 2.6, 2.6)

            # legenda (chips no topo esquerdo, empilhados)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(color)
            p.drawEllipse(QPointF(legend_x + 3, legend_y + 5), 2.5, 2.5)
            p.setPen(QColor(theme.TEXT_MUTED))
            p.setFont(px_font(10))
            p.drawText(QRectF(legend_x + 10, legend_y - 3, 120, 14),
                       Qt.AlignmentFlag.AlignLeft, name)
            legend_y += 15

        # escala à direita — pula rótulos que cairiam sob uma pílula
        p.setFont(px_font(10))
        for rect, label in scale_rects:
            if any(rect.intersects(pr) for pr, _t, _c in pill_rects):
                continue
            p.setPen(QColor(theme.TEXT_FAINT))
            p.drawText(rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                       label)

        # pílulas de valor atual (fundo opaco + borda da série)
        for rect, txt, color in pill_rects:
            p.setPen(QPen(color, 1.0))
            p.setBrush(QColor(theme.CARD))
            p.drawRoundedRect(rect, 5.0, 5.0)
            p.setPen(color)
            p.setFont(px_font(10, QFont.Weight.DemiBold))
            p.drawText(rect, Qt.AlignmentFlag.AlignCenter, txt)
        p.end()


class CoreBars(QFrame):
    """Barras por núcleo de CPU (uma amostra por push)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(110)
        self._values: list[float] = []
        self.setAttribute(Qt.WidgetAttribute.WA_StyledBackground, False)
        self.setStyleSheet("QFrame { background: transparent; border: none; }")
        bind_retheme(self, self.update)

    def push(self, values: list[float]) -> None:
        self._values = values
        self.update()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        if not self._values:
            p.setPen(QColor(theme.TEXT_FAINT))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "aguardando dados…")
            p.end()
            return
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        pad = 14.0
        n = len(self._values)
        gap = 4.0
        bar_w = (w - 2 * pad - (n - 1) * gap) / max(1, n)
        p.setFont(px_font(10))
        for i, v in enumerate(self._values):
            x = pad + i * (bar_w + gap)
            ratio = max(0.0, min(100.0, v)) / 100.0
            full_h = h - 2 * pad - 14
            bh = max(3.0, full_h * ratio)
            rect = QRectF(x, h - pad - 14 - full_h, bar_w, full_h)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(theme.BORDER))
            p.drawRoundedRect(rect, 2.5, 2.5)
            if v >= 95:
                color = QColor(theme.DANGER)
            elif v >= 80:
                color = QColor(theme.WARNING)
            else:
                color = accent()
            p.setBrush(color)
            p.drawRoundedRect(QRectF(x, h - pad - 14 - bh, bar_w, bh), 2.5, 2.5)
            p.setPen(QColor(theme.TEXT_FAINT))
            p.drawText(QRectF(x, h - pad - 10, bar_w, 12),
                       Qt.AlignmentFlag.AlignHCenter, f"{v:.0f}")
        p.end()


# ---------------------------------------------------------- ToggleSwitch


class ToggleSwitch(QFrame):
    """Interruptor estilo Windows 11 — animado, focalizável por teclado."""

    toggled = Signal(bool)

    def __init__(self, checked: bool = False, parent=None):
        super().__init__(parent)
        self.setFixedSize(40, 20)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
        self.setAccessibleName("Interruptor")
        self._checked = checked
        self._pos = 1.0 if checked else 0.0
        self._focus = False
        self._anim = QVariantAnimation(self)
        self._anim.valueChanged.connect(self._on_anim)
        bind_retheme(self, self.update)

    def _duration(self) -> int:
        return max(60, theme.dur("fast"))

    def _on_anim(self, v: float) -> None:
        self._pos = v
        self.update()

    def isChecked(self) -> bool:
        return self._checked

    def setChecked(self, checked: bool, emit: bool = False) -> None:
        if checked == self._checked:
            return
        self._checked = checked
        self._animate()
        if emit:
            self.toggled.emit(self._checked)

    def toggle(self) -> None:
        self._checked = not self._checked
        self._animate()
        self.toggled.emit(self._checked)

    def _animate(self) -> None:
        d = self._duration()
        if d <= 0:
            self._pos = 1.0 if self._checked else 0.0
            self.update()
            return
        self._anim.stop()
        self._anim.setDuration(d)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.setStartValue(self._pos)
        self._anim.setEndValue(1.0 if self._checked else 0.0)
        self._anim.start()

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.toggle()
        else:
            super().mousePressEvent(event)

    def keyPressEvent(self, event) -> None:
        if event.key() in (Qt.Key.Key_Space, Qt.Key.Key_Return, Qt.Key.Key_Enter):
            self.toggle()
        else:
            super().keyPressEvent(event)

    def focusInEvent(self, event) -> None:
        self._focus = True
        self.update()
        super().focusInEvent(event)

    def focusOutEvent(self, event) -> None:
        self._focus = False
        self.update()
        super().focusOutEvent(event)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        r = h / 2
        if self._checked:
            track = accent()
            knob = QColor("#ffffff")
        else:
            track = QColor(theme.SURFACE3)
            knob = QColor(theme.TEXT_MUTED)
        # trilho
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(track)
        p.drawRoundedRect(QRectF(0.5, 0.5, w - 1, h - 1), r, r)
        # knob
        knob_r = h / 2 - 3
        tx = 3.0 + (w - h) * self._pos
        p.setBrush(knob)
        p.drawEllipse(QPointF(tx + knob_r, h / 2), knob_r, knob_r)
        # anel de foco
        if self._focus:
            p.setPen(QPen(QColor(theme.ACCENT), 2.0))
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawRoundedRect(QRectF(1.0, 1.0, w - 2, h - 2), r, r)
        p.end()


# ------------------------------------------------------------- animações


def fade_in(widget: QWidget, duration_ms: int = 160, slide: int = 8) -> None:
    """Fade (opcionalmente com deslize curto) ao exibir um widget."""
    duration = 1 if theme.reduce_motion() else max(1, duration_ms)
    prev = getattr(widget, "_fade_anim", None)
    if prev is not None:
        try:
            prev.stop()
        except RuntimeError:
            pass
    effect = QGraphicsOpacityEffect(widget)
    widget.setGraphicsEffect(effect)
    anim = QVariantAnimation(widget)
    anim.setDuration(duration)
    anim.setStartValue(0.0)
    anim.setEndValue(1.0)
    anim.setEasingCurve(QEasingCurve.Type.OutCubic)

    orig_y = widget.y()

    def _apply(v: float) -> None:
        try:
            effect.setOpacity(v)
            if slide:
                widget.move(widget.x(), orig_y + int((1.0 - v) * slide))
        except RuntimeError:
            # widget/efeito já destruído — apenas interrompe
            anim.stop()

    anim.valueChanged.connect(_apply)

    def _cleanup() -> None:
        try:
            widget.setGraphicsEffect(None)
            if slide:
                widget.move(widget.x(), orig_y)
        except RuntimeError:
            pass

    anim.finished.connect(_cleanup)
    effect.setOpacity(0.0)
    anim.start()
    widget._fade_anim = anim  # keep-alive


def page_transition(widget: QWidget) -> None:
    """Transição padrão de troca de página: fade puro (sem mexer na geometria —

    mover widgets dentro de um QStackedWidget deixa deslocamento permanente
    quando a animação é interrompida por outra navegação).
    """
    fade_in(widget, duration_ms=170, slide=0)


class SmoothScrollArea(QScrollArea):
    """QScrollArea com rolagem animada (roda do mouse)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scroll_anim: Optional[QVariantAnimation] = None

    def wheelEvent(self, event) -> None:
        bar = self.verticalScrollBar()
        if bar is None or not bar.isVisible():
            super().wheelEvent(event)
            return
        delta = event.angleDelta().y()
        if delta == 0:
            super().wheelEvent(event)
            return
        target = max(bar.minimum(), min(bar.maximum(), bar.value() - int(delta * 1.6)))
        d = theme.dur("normal")
        if d <= 0 or abs(target - bar.value()) > 400:
            bar.setValue(target)
            event.accept()
            return
        if self._scroll_anim is not None:
            self._scroll_anim.stop()
        anim = QVariantAnimation(self)
        anim.setDuration(240)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.setStartValue(bar.value())
        anim.setEndValue(target)
        anim.valueChanged.connect(lambda v, b=bar: b.setValue(int(v)))
        anim.start()
        self._scroll_anim = anim
        event.accept()


# ------------------------------------------------------------- Skeleton


class SkeletonBlock(QFrame):
    """Bloco de esqueleto com pulso suave (só anima quando visível)."""

    def __init__(self, parent=None, height: int = 14):
        super().__init__(parent)
        self.setFixedHeight(height)
        self._opacity = 1.0
        self._anim = QVariantAnimation(self)
        self._anim.setDuration(1100)
        self._anim.setStartValue(1.0)
        self._anim.setEndValue(0.45)
        self._anim.setLoopCount(-1)
        self._anim.setEasingCurve(QEasingCurve.Type.InOutSine)
        self._anim.valueChanged.connect(self._on_tick)
        bind_retheme(self, self.update)

    def _on_tick(self, v: float) -> None:
        self._opacity = v
        self.update()

    def showEvent(self, event) -> None:
        if theme.dur("fast") > 0:
            self._anim.start()
        super().showEvent(event)

    def hideEvent(self, event) -> None:
        self._anim.stop()
        super().hideEvent(event)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        c = QColor(theme.BORDER_STRONG)
        c.setAlpha(int(255 * self._opacity))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(c)
        p.drawRoundedRect(QRectF(0.5, 0.5, self.width() - 1, self.height() - 1), 6, 6)
        p.end()


# ----------------------------------------------------------------- Toast


class Toast(QFrame):
    """Notificação não bloqueante — borda semântica à esquerda + ícone."""

    _KINDS = {
        "success": ("check_circle", "success"),
        "error": ("x_circle", "danger"),
        "warning": ("alert", "warning"),
        "info": ("info", "info"),
    }

    def __init__(self, parent: QWidget, text: str, kind: str = "info", icon_name: str = ""):
        super().__init__(parent)
        icon_name, semantic = self._KINDS.get(kind, self._KINDS["info"])
        fg = {
            "success": theme.SUCCESS, "danger": theme.DANGER,
            "warning": theme.WARNING, "info": theme.token("info"),
        }[semantic]
        self.setStyleSheet(
            f"""
            background: {theme.SURFACE3}; border: 1px solid {theme.BORDER_STRONG};
            border-left: 3px solid {fg}; border-radius: 10px;
            """
        )
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(10)
        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, semantic, 18))
        lbl = ThemeLabel(text, "body_sm")
        lbl.setMaximumWidth(380)
        lay.addWidget(ic)
        lay.addWidget(lbl)

        self.adjustSize()
        effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(effect)
        self._effect = effect
        effect.setOpacity(0.0)
        self.show()
        self.raise_()

        d_in = theme.dur("toast") or 1
        anim = QVariantAnimation(self)
        anim.setDuration(d_in)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.valueChanged.connect(effect.setOpacity)
        anim.start()
        self._keep = anim
        QTimer.singleShot(3800, self._fade_out)

    def _fade_out(self) -> None:
        anim = QVariantAnimation(self)
        anim.setDuration(300)
        anim.setStartValue(1.0)
        anim.setEndValue(0.0)
        anim.valueChanged.connect(self._effect.setOpacity)
        anim.finished.connect(self.deleteLater)
        anim.start()
        self._out = anim


class ToastHost(QWidget):
    """Âncora de toasts no canto inferior direito da janela."""

    def __init__(self, parent: QWidget):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self._toasts: list[Toast] = []

    def show_toast(self, text: str, kind: str = "info", icon_name: str = "") -> None:
        toast = Toast(self.parentWidget(), text, kind, icon_name)
        self._toasts.append(toast)
        self._reposition()
        toast.destroyed.connect(lambda *_: self._remove(toast))

    def _remove(self, toast: Toast) -> None:
        if toast in self._toasts:
            self._toasts.remove(toast)
        self._reposition()

    def _reposition(self) -> None:
        try:
            host = self.parentWidget()
        except RuntimeError:
            return  # host já destruído (encerramento do app)
        if not host:
            return
        y = host.height() - 52
        for toast in reversed(self._toasts):
            toast.move(host.width() - toast.width() - 24, y - toast.height())
            y -= toast.height() + 10

    def resizeEvent(self, event) -> None:
        self.setGeometry(0, 0, self.parentWidget().width(), self.parentWidget().height())
        self._reposition()
        super().resizeEvent(event)


def toast_for(widget: QWidget, text: str, kind: str = "info") -> None:
    """Encontra o ToastHost da janela e mostra a notificação."""
    win = widget.window()
    host = win.findChild(ToastHost)
    if host:
        host.show_toast(text, kind)
    else:
        Toast(win, text, kind)


# --------------------------------------------------------------- Spinner


class Spinner(QFrame):
    def __init__(self, size: int = 24, parent=None):
        super().__init__(parent)
        self.setFixedSize(size, size)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self._angle = 0
        self._timer = QTimer(self)
        self._timer.setInterval(30)
        self._timer.timeout.connect(self._tick)

    def _tick(self) -> None:
        self._angle = (self._angle + 14) % 360
        self.update()

    def start(self) -> None:
        self._timer.start()
        self.show()

    def stop(self) -> None:
        self._timer.stop()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = QRectF(3, 3, self.width() - 6, self.height() - 6)
        p.setPen(QPen(QColor(theme.BORDER_STRONG), 3, Qt.PenStyle.SolidLine,
                      Qt.PenCapStyle.RoundCap))
        p.drawArc(rect, 0, 360 * 16)
        p.setPen(QPen(accent(), 3, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.drawArc(rect, int(self._angle * 16), 100 * 16)
        p.end()


# ------------------------------------------------------------- EmptyState


class EmptyState(QFrame):
    def __init__(self, icon_name: str, title: str, subtitle: str = "",
                 action_text: str = "", on_action=None, parent=None):
        super().__init__(parent)
        # seletor próprio: sem ele o Qt aplicaria o estilo a TODOS os filhos
        # (incluindo o botão de ação, que perderia o preenchimento)
        self.setObjectName("emptyState")
        self.setStyleSheet("#emptyState { background: transparent; border: none; }")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("xl"), theme.pad("xl"), theme.pad("xl"), theme.pad("xl"))
        lay.setSpacing(theme.pad("sm"))
        lay.addStretch(1)
        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, "faint", 44))
        ic.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(ic)
        self._title = ThemeLabel(title, "title_sm")
        self._title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(self._title)
        if subtitle:
            s = ThemeLabel(subtitle, "body_sm", wrap=True)
            s.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lay.addWidget(s)
        if action_text and on_action:
            btn = Button(action_text, "primary")
            btn.clicked.connect(on_action)
            wrap = QHBoxLayout()
            wrap.addStretch(1)
            wrap.addWidget(btn)
            wrap.addStretch(1)
            lay.addLayout(wrap)
        lay.addStretch(1)


# ------------------------------------------------------------ KeyInfoRow


class KeyInfoRow(QFrame):
    def __init__(self, label: str, value: str = "—", icon_name: str = "", parent=None):
        super().__init__(parent)
        self.setStyleSheet("background: transparent; border: none;")
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 7, 0, 7)
        lay.setSpacing(theme.pad("sm"))
        self._icon_name = icon_name
        self._icon = QLabel()
        if icon_name:
            self._icon.setPixmap(icons.pixmap(icon_name, "faint", 15))
            lay.addWidget(self._icon)
        lbl = ThemeLabel(label, "body_sm")
        lbl.setMinimumWidth(120)
        lay.addWidget(lbl)
        self._value = ThemeLabel(value, "body_sm", wrap=True)
        f = self._value.font()
        f.setWeight(QFont.Weight.Medium)
        lay.addWidget(self._value, 1)
        bind_retheme(self, self._retint)

    def _retint(self) -> None:
        if self._icon_name:
            self._icon.setPixmap(icons.pixmap(self._icon_name, "faint", 15))

    def set_value(self, text: str) -> None:
        self._value.setText(text)


# --------------------------------------------------------------- dialogs


def ensure_admin_or_warn(parent: QWidget, action: str) -> bool:
    """Pré-checagem de elevação para ações administrativas.

    Retorna True se a ação pode continuar (já é admin, não-Windows, ou o
    usuário optou por tentar mesmo assim). Se o usuário aceitar elevar, o DK
    é relançado como administrador e a ação atual é abortada (False).
    """
    import sys as _sys

    if _sys.platform != "win32":
        return True
    from nexus.core import elevation

    if elevation.is_admin():
        return True
    from PySide6.QtWidgets import QApplication, QMessageBox

    ret = QMessageBox.question(
        parent,
        "Permissão de administrador",
        f"A ação “{action}” precisa de privilégios de administrador.\n\n"
        "Elevar o DK agora? O aplicativo reinicia como administrador e você "
        "repete a ação.\n\n"
        "Escolha “Não” para tentar mesmo assim — alguns ajustes podem falhar.",
        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
    )
    if ret == QMessageBox.StandardButton.Yes:
        if elevation.relaunch_as_admin():
            app = QApplication.instance()
            if app is not None:
                app.quit()
            return False
        toast_for(parent, "Não foi possível relançar como administrador.", "error")
    return True


def confirm(parent: QWidget, title: str, text: str, dangerous: bool = False,
            confirm_text: str = "Confirmar", undo_note: Optional[bool] = None) -> bool:
    """Confirmação padronizada.

    Ações de risco mostram o que será alterado e lembram que há desfazer
    disponível no Histórico (quando aplicável à operação).
    """
    box = QMessageBox(parent)
    box.setWindowTitle(title)
    note = dangerous if undo_note is None else undo_note
    body = text
    if note:
        body += (
            "<br><br><span style='color:" + theme.TEXT_FAINT + "; font-size:11px'>"
            "Quando a operação é reversível, ela fica registrada no Histórico "
            "com botão de desfazer.</span>"
        )
    box.setText(body)
    box.setTextFormat(Qt.TextFormat.RichText)
    yes = box.addButton(confirm_text, QMessageBox.ButtonRole.YesRole)
    box.addButton("Cancelar", QMessageBox.ButtonRole.NoRole)
    icon = "alert" if dangerous else "info"
    box.setIconPixmap(icons.pixmap(icon, "danger" if dangerous else "accent_text", 40))
    box.exec()
    return box.clickedButton() is yes


class TaskDialog(QDialog):
    """Diálogo de progresso com lista de etapas (para otimizações)."""

    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumSize(520, 380)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("lg"), theme.pad("md"), theme.pad("lg"), theme.pad("md"))
        lay.setSpacing(theme.pad("sm"))

        header = ThemeLabel(title, "title_sm")
        lay.addWidget(header)

        self.list = QListWidget()
        self.list.setMinimumHeight(180)
        lay.addWidget(self.list, 1)

        from PySide6.QtWidgets import QProgressBar

        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        lay.addWidget(self.progress)

        self.status = ThemeLabel("Preparando…", "body_sm")
        lay.addWidget(self.status)

        self.close_btn = Button("Concluído", "primary")
        self.close_btn.setEnabled(False)
        self.close_btn.clicked.connect(self.accept)
        lay.addWidget(self.close_btn, 0, Qt.AlignmentFlag.AlignRight)

    def set_total(self, total: int) -> None:
        self._total = max(1, total)
        self._done = 0
        self.progress.setValue(0)

    def begin_step(self, name: str) -> None:
        self.status.setText(f"Executando: {name}")
        item = QListWidgetItem(f"Executando — {name}")
        item.setIcon(icons.icon("chevron_right", "muted", 14))
        self.list.addItem(item)
        self.list.scrollToBottom()

    def step_done(self, name: str, ok: bool, message: str) -> None:
        self._done += 1
        self.progress.setValue(int(self._done / self._total * 100))
        mark = "Concluído" if ok else "Falhou"
        row = self.list.count() - 1
        if row >= 0:
            item = self.list.item(row)
            base = item.text().split("— ", 1)[-1]
            item.setText(f"{mark} — {base} · {message}")
            item.setIcon(icons.icon("check_circle" if ok else "x_circle",
                                    "success" if ok else "danger", 14))

    def finish(self, summary: str) -> None:
        self.status.setText(summary)
        self.progress.setValue(100)
        self.close_btn.setEnabled(True)
