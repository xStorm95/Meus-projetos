"""Biblioteca de componentes visuais: cartões, gauges, gráficos, toggles, toasts.

Todos os componentes são pintados com QPainter (sem dependências externas),
com animações suaves e tema azul-neon consistente.
"""

from __future__ import annotations

import time
from collections import deque
from typing import Optional

from PySide6.QtCore import (
    QEasingCurve,
    QPoint,
    QPointF,
    QRectF,
    Qt,
    QTimer,
    QVariantAnimation,
    Signal,
)
from PySide6.QtGui import (
    QBrush,
    QColor,
    QConicalGradient,
    QFont,
    QFontMetrics,
    QLinearGradient,
    QPainter,
    QPainterPath,
    QPen,
)
from PySide6.QtWidgets import (
    QDialog,
    QFrame,
    QGraphicsOpacityEffect,
    QHBoxLayout,
    QLabel,
    QLayout,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QSizePolicy,
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


# ------------------------------------------------------------------ Card


class Card(QFrame):
    """Cartão com cabeçalho (ícone + título) e área de conteúdo."""

    def __init__(self, title: str = "", icon_name: str = "", parent=None):
        super().__init__(parent)
        self.setObjectName("card")
        self.setStyleSheet(
            f"""
            QFrame#card {{
                background: {theme.CARD};
                border: 1px solid {theme.BORDER};
                border-radius: 14px;
            }}
            QFrame#card:hover {{ border-color: {theme.BORDER}; }}
            """
        )
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(18, 14, 18, 16)
        self._layout.setSpacing(10)

        self._header = QHBoxLayout()
        self._header.setSpacing(8)
        if icon_name:
            ic = QLabel()
            ic.setPixmap(icons.pixmap(icon_name, "accent", 20))
            self._header.addWidget(ic)
        if title:
            lbl = QLabel(title)
            lbl.setStyleSheet(
                f"color: {theme.TEXT}; font-size: 14px; font-weight: 700; background: transparent;"
            )
            self._header.addWidget(lbl)
        self._header.addStretch(1)
        self._title_label = None
        self._layout.addLayout(self._header)

    def header_layout(self) -> QHBoxLayout:
        return self._header

    def body_layout(self) -> QVBoxLayout:
        return self._layout


class SectionTitle(QLabel):
    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 12px; font-weight: 700;"
            "letter-spacing: 1px; text-transform: uppercase; background: transparent;"
        )


class Pill(QLabel):
    """Etiqueta compacta (chip) com variants de cor."""

    def __init__(self, text: str = "", kind: str = "muted", parent=None):
        super().__init__(text, parent)
        self.set_kind(kind)

    def set_kind(self, kind: str) -> None:
        colors = {
            "accent": (theme.ACCENT, "#06222f"),
            "success": (theme.SUCCESS, "#0a2b21"),
            "warning": (theme.WARNING, "#2b220a"),
            "danger": (theme.DANGER, "#2b1212"),
            "muted": (theme.TEXT_MUTED, theme.PANEL),
        }
        fg, bg = colors.get(kind, colors["muted"])
        self.setStyleSheet(
            f"color: {fg}; background: {bg}; border: 1px solid {fg};"
            "border-radius: 9px; padding: 2px 10px; font-size: 11px; font-weight: 700;"
        )
        self.adjustSize()


class StatTile(QFrame):
    """Bloco compacto: ícone + valor + rótulo."""

    def __init__(self, icon_name: str, label: str, value: str = "—",
                 sub: str = "", color: str = "accent", parent=None):
        super().__init__(parent)
        self.setStyleSheet(
            f"""
            background: {theme.CARD}; border: 1px solid {theme.BORDER};
            border-radius: 12px;
            """
        )
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 12, 14, 12)
        lay.setSpacing(12)

        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, color, 26))
        lay.addWidget(ic)

        col = QVBoxLayout()
        col.setSpacing(0)
        self._value = QLabel(value)
        self._value.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 17px; font-weight: 800; background: transparent;"
        )
        self._label = QLabel(label)
        self._label.setStyleSheet(
            f"color: {theme.TEXT_MUTED}; font-size: 11px; background: transparent;"
        )
        col.addWidget(self._value)
        col.addWidget(self._label)
        lay.addLayout(col, 1)

        self._sub = QLabel(sub)
        self._sub.setStyleSheet(
            f"color: {theme.TEXT_FAINT}; font-size: 11px; background: transparent;"
        )
        lay.addWidget(self._sub)

    def set_value(self, value: str, sub: str = "") -> None:
        self._value.setText(value)
        if sub:
            self._sub.setText(sub)
        elif sub is not None and sub == "":
            self._sub.setText("")


# ------------------------------------------------------------- GaugeRing


class GaugeRing(QFrame):
    """Medidor circular animado (0–100) com texto central."""

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
        self._anim.setDuration(500)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(self._on_anim)

    def set_value(self, value: Optional[float], sub: str = "") -> None:
        if value is None:
            self._label_sub = sub or "não suportado"
            self._target = None
            self.update()
            return
        self._label_sub = sub
        self._target = float(value)
        self._anim.stop()
        self._anim.setStartValue(self._display)
        self._anim.setEndValue(float(value))
        self._anim.start()
        self.update()

    def _on_anim(self, v: float) -> None:
        self._display = v
        self.update()

    @property
    def _label_sub(self) -> str:
        return self._sub

    @_label_sub.setter
    def _label_sub(self, v: str) -> None:
        self._sub = v

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()
        h = self.height()
        m = 12.0
        rect = QRectF(m, m, w - 2 * m, h - 2 * m)
        pen_w = 9.0
        start = 225 * 16
        span = -270 * 16

        # trilho
        p.setPen(QPen(QColor(theme.BORDER), pen_w, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.drawArc(rect, start, span)

        if getattr(self, "_target", None) is not None:
            ratio = max(0.0, min(100.0, self._display)) / 100.0
            # brilho
            glow_color = accent() if self._display < self._warn_at else QColor(theme.WARNING)
            p.setPen(QPen(QColor(glow_color.red(), glow_color.green(), glow_color.blue(), 60),
                          pen_w + 5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
            p.drawArc(rect, start, int(span * ratio))
            # valor
            p.setPen(QPen(glow_color, pen_w, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
            p.drawArc(rect, start, int(span * ratio))

        # textos
        p.setPen(QColor(theme.TEXT))
        p.setFont(scaled_font(self.font(), 1.7, bold=True))
        if getattr(self, "_target", None) is None:
            p.drawText(rect.adjusted(0, -6, 0, 0), Qt.AlignmentFlag.AlignCenter, "N/D")
        else:
            p.drawText(rect.adjusted(0, -6, 0, 0), Qt.AlignmentFlag.AlignCenter,
                       f"{self._display:.0f}{self._suffix}")
        p.setPen(muted())
        p.setFont(scaled_font(self.font(), 0.85, min_pt=8.0))
        p.drawText(QRectF(0, h * 0.52, w, h * 0.2), Qt.AlignmentFlag.AlignHCenter, self._label)
        p.setPen(QColor(theme.TEXT_FAINT))
        p.drawText(QRectF(0, h * 0.66, w, h * 0.18), Qt.AlignmentFlag.AlignHCenter, self._sub)
        p.end()


# -------------------------------------------------------------- LineChart


class LineChart(QFrame):
    """Gráfico de linhas em tempo real, múltiplas séries, pintado à mão."""

    def __init__(self, unit: str = "%", max_points: int = 120, fixed_max: float = 100.0,
                 show_grid: bool = True, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(160)
        self._unit = unit
        self._max = fixed_max
        self._fixed = fixed_max is not None
        self._grid = show_grid
        self._series: dict[str, deque] = {}
        self._colors: dict[str, QColor] = {}
        self.setStyleSheet(
            f"background: {theme.PANEL}; border: 1px solid {theme.BORDER}; border-radius: 12px;"
        )

    def add_series(self, name: str, color: str = "accent") -> None:
        self._series[name] = deque(maxlen=120)
        self._colors[name] = QColor(color if color.startswith("#") else theme.ACCENT)

    def push(self, name: str, value: Optional[float]) -> None:
        if name not in self._series:
            self.add_series(name)
        self._series[name].append(value)
        self.update()

    def set_values(self, name: str, values: list) -> None:
        if name not in self._series:
            self.add_series(name)
        self._series[name].clear()
        self._series[name].extend(values[-120:])

    def clear(self) -> None:
        for d in self._series.values():
            d.clear()
        self.update()

    def current_max(self) -> float:
        vals = [v for d in self._series.values() for v in d if v is not None]
        return max(vals) if vals else 0.0

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        pad_l, pad_r, pad_t, pad_b = 6.0, 58.0, 12.0, 10.0

        # escala
        top = self._max if self._fixed else max(1.0, self.current_max() * 1.25)
        inner_w = w - pad_l - pad_r
        inner_h = h - pad_t - pad_b

        # grade
        if self._grid:
            p.setPen(QPen(QColor(theme.BORDER_SOFT), 1))
            for i in range(5):
                y = pad_t + inner_h * i / 4
                p.drawLine(QPointF(pad_l, y), QPointF(w - pad_r, y))
            p.setPen(QPen(QColor(theme.TEXT_FAINT)))
            p.setFont(scaled_font(self.font(), 0.8))
            for i in range(5):
                val = top * (1 - i / 4)
                label = f"{val:.0f}" if val >= 10 or val == 0 else f"{val:.1f}"
                p.drawText(
                    QRectF(w - pad_r + 4, pad_t + inner_h * i / 4 - 7, pad_r - 6, 14),
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                    label,
                )

        # séries
        legend_x = w - pad_r + 4
        legend_y = h - 6
        for name, data in self._series.items():
            color = self._colors.get(name, accent())
            pts: list[QPointF] = []
            n = len(data)
            if n == 0:
                continue
            for i, v in enumerate(data):
                if v is None:
                    continue
                # alinha os pontos à direita do gráfico
                x = pad_l + inner_w * ((120 - n + i) / 119.0)
                y = pad_t + inner_h * (1 - min(v, top) / top)
                pts.append(QPointF(x, y))
            if not pts:
                continue

            # preenchimento
            path = QPainterPath()
            path.moveTo(pts[0])
            for pt in pts[1:]:
                path.lineTo(pt)
            fill = QPainterPath(path)
            fill.lineTo(pts[-1].x(), pad_t + inner_h)
            fill.lineTo(pts[0].x(), pad_t + inner_h)
            fill.closeSubpath()
            grad = QLinearGradient(0, pad_t, 0, pad_t + inner_h)
            grad.setColorAt(0, QColor(color.red(), color.green(), color.blue(), 70))
            grad.setColorAt(1, QColor(color.red(), color.green(), color.blue(), 0))
            p.fillPath(fill, QBrush(grad))

            # linha
            p.setPen(QPen(color, 2.0, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
            p.drawPath(path)

            # valor atual
            last = pts[-1]
            p.setBrush(color)
            p.setPen(Qt.PenStyle.NoPen)
            p.drawEllipse(last, 3.0, 3.0)
            p.setFont(scaled_font(self.font(), 0.8, bold=True))
            val_txt = data[-1]
            if val_txt is not None:
                txt = f"{val_txt:.0f}" if self._unit == "%" else f"{val_txt:.1f}"
                p.setPen(color)
                p.drawText(
                    QRectF(last.x() + 4, last.y() - 8, pad_r - 8, 16),
                    Qt.AlignmentFlag.AlignLeft, txt,
                )
            # legenda
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(color)
            p.drawEllipse(QPointF(legend_x + 4, legend_y - 8), 3, 3)
            p.setPen(muted())
            p.setFont(QFont(self.font()))
            p.drawText(
                QRectF(legend_x + 12, legend_y - 15, 70, 14),
                Qt.AlignmentFlag.AlignLeft, name,
            )
            legend_y -= 16
        p.end()


class CoreBars(QFrame):
    """Barras por núcleo de CPU (uma amostra por push)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(110)
        self._values: list[float] = []
        self.setStyleSheet(
            f"background: {theme.PANEL}; border: 1px solid {theme.BORDER}; border-radius: 12px;"
        )

    def push(self, values: list[float]) -> None:
        self._values = values
        self.update()

    def paintEvent(self, event) -> None:
        if not self._values:
            p = QPainter(self)
            p.setPen(QColor(theme.TEXT_FAINT))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "aguardando dados…")
            p.end()
            return
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        pad = 14.0
        n = len(self._values)
        gap = 4.0
        bar_w = (w - 2 * pad - (n - 1) * gap) / max(1, n)
        max_val = max(self._values) if self._values else 0
        p.setFont(scaled_font(self.font(), 0.8))
        for i, v in enumerate(self._values):
            x = pad + i * (bar_w + gap)
            ratio = max(0.0, min(100.0, v)) / 100.0
            full_h = h - 2 * pad - 14
            bh = max(3.0, full_h * ratio)
            rect = QRectF(x, h - pad - 14 - full_h, bar_w, full_h)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(theme.BORDER))
            p.drawRoundedRect(rect, 3, 3)
            color = accent()
            if v >= 90:
                color = QColor(theme.DANGER)
            elif v >= 75:
                color = QColor(theme.WARNING)
            elif v == max_val and max_val > 20:
                color = accent()
            rect2 = QRectF(x, h - pad - 14 - bh, bar_w, bh)
            grad = QLinearGradient(rect2.topLeft(), rect2.bottomLeft())
            grad.setColorAt(0, color.lighter(130))
            grad.setColorAt(1, color)
            p.setBrush(QBrush(grad))
            p.drawRoundedRect(rect2, 3, 3)
            p.setPen(QColor(theme.TEXT_FAINT))
            p.drawText(
                QRectF(x, h - pad - 10, bar_w, 12),
                Qt.AlignmentFlag.AlignHCenter, f"{v:.0f}",
            )
        p.end()


# ----------------------------------------------------------- ToggleSwitch


class ToggleSwitch(QFrame):
    """Interruptor animado estilo premium."""

    toggled = Signal(bool)

    def __init__(self, checked: bool = False, parent=None):
        super().__init__(parent)
        self.setFixedSize(46, 25)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self._checked = checked
        self._pos = 1.0 if checked else 0.0
        self._anim = QVariantAnimation(self)
        self._anim.setDuration(180)
        self._anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        self._anim.valueChanged.connect(self._on_anim)

    def _on_anim(self, v: float) -> None:
        self._pos = v
        self.update()

    def isChecked(self) -> bool:
        return self._checked

    def setChecked(self, checked: bool) -> None:
        if checked == self._checked:
            return
        self._checked = checked
        self._animate()

    def toggle(self) -> None:
        self._checked = not self._checked
        self._animate()
        self.toggled.emit(self._checked)

    def _animate(self) -> None:
        self._anim.stop()
        self._anim.setStartValue(self._pos)
        self._anim.setEndValue(1.0 if self._checked else 0.0)
        self._anim.start()

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.toggle()
        else:
            super().mousePressEvent(event)

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        r = h / 2
        if self._checked:
            track = accent()
        else:
            track = QColor(theme.BORDER)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(track)
        p.drawRoundedRect(QRectF(0.5, 0.5, w - 1, h - 1), r, r)
        tx = 2.5 + (w - h) * self._pos
        p.setBrush(QColor("#ffffff"))
        p.drawEllipse(QRectF(tx, 2.5, h - 5, h - 5))
        p.end()


# ---------------------------------------------------------------- Toast


class Toast(QFrame):
    """Notificação flutuante com fade automático."""

    _STYLES = {
        "success": (theme.SUCCESS, "#0a2b21"),
        "error": (theme.DANGER, "#2b1212"),
        "warning": (theme.WARNING, "#2b220a"),
        "info": (theme.ACCENT, "#06222f"),
    }

    def __init__(self, parent: QWidget, text: str, kind: str = "info", icon_name: str = ""):
        super().__init__(parent)
        fg, bg = self._STYLES.get(kind, self._STYLES["info"])
        icon_name = icon_name or {
            "success": "check", "error": "x", "warning": "alert", "info": "info"
        }.get(kind, "info")
        self.setStyleSheet(
            f"background: {bg}; border: 1px solid {fg}; border-radius: 10px;"
        )
        lay = QHBoxLayout(self)
        lay.setContentsMargins(14, 10, 14, 10)
        lay.setSpacing(10)
        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, fg if fg.startswith("#") else kind, 18))
        lbl = QLabel(text)
        lbl.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 12px; background: transparent;"
        )
        lbl.setWordWrap(True)
        lbl.setMaximumWidth(360)
        lay.addWidget(ic)
        lay.addWidget(lbl)

        self.adjustSize()
        effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(effect)
        self._effect = effect
        effect.setOpacity(0.0)
        self.show()
        self.raise_()

        anim = QVariantAnimation(self)
        anim.setDuration(220)
        anim.setStartValue(0.0)
        anim.setEndValue(1.0)
        anim.valueChanged.connect(effect.setOpacity)
        anim.start()
        QTimer.singleShot(3600, self._fade_out)

    def _fade_out(self) -> None:
        anim = QVariantAnimation(self)
        anim.setDuration(320)
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
        host = self.parentWidget()
        if not host:
            return
        y = host.height() - 60
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


# -------------------------------------------------------------- Spinner


class Spinner(QFrame):
    def __init__(self, size: int = 28, parent=None):
        super().__init__(parent)
        self.setFixedSize(size, size)
        self._angle = 0
        self._timer = QTimer(self)
        self._timer.setInterval(30)
        self._timer.timeout.connect(self._tick)

    def _tick(self) -> None:
        self._angle = (self._angle + 12) % 360
        self.update()

    def start(self) -> None:
        self._timer.start()

    def stop(self) -> None:
        self._timer.stop()

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        rect = QRectF(3, 3, self.width() - 6, self.height() - 6)
        p.setPen(QPen(QColor(theme.BORDER), 3, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.drawEllipse(rect)
        p.setPen(QPen(accent(), 3, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.drawArc(rect, int(self._angle * 16), 90 * 16)
        p.end()


# ------------------------------------------------------------ EmptyState


class EmptyState(QFrame):
    def __init__(self, icon_name: str, title: str, subtitle: str = "",
                 action_text: str = "", on_action=None, parent=None):
        super().__init__(parent)
        self.setStyleSheet("background: transparent; border: none;")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(30, 30, 30, 30)
        lay.setSpacing(8)
        lay.addStretch(1)
        ic = QLabel()
        ic.setPixmap(icons.pixmap(icon_name, "muted", 52))
        ic.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lay.addWidget(ic)
        t = QLabel(title)
        t.setAlignment(Qt.AlignmentFlag.AlignCenter)
        t.setStyleSheet(f"color: {theme.TEXT}; font-size: 15px; font-weight: 700;")
        lay.addWidget(t)
        if subtitle:
            s = QLabel(subtitle)
            s.setWordWrap(True)
            s.setAlignment(Qt.AlignmentFlag.AlignCenter)
            s.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
            lay.addWidget(s)
        if action_text and on_action:
            btn = QPushButton(action_text)
            btn.setProperty("accent", True)
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
        lay.setSpacing(10)
        if icon_name:
            ic = QLabel()
            ic.setPixmap(icons.pixmap(icon_name, "muted", 16))
            lay.addWidget(ic)
        lbl = QLabel(label)
        lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px; background: transparent;")
        lbl.setMinimumWidth(120)
        lay.addWidget(lbl)
        self._value = QLabel(value)
        self._value.setWordWrap(True)
        self._value.setStyleSheet(
            f"color: {theme.TEXT}; font-size: 12px; font-weight: 600; background: transparent;"
        )
        lay.addWidget(self._value, 1)

    def set_value(self, text: str) -> None:
        self._value.setText(text)


# --------------------------------------------------------------- dialogs


def confirm(parent: QWidget, title: str, text: str, dangerous: bool = False,
            confirm_text: str = "Confirmar") -> bool:
    box = QMessageBox(parent)
    box.setWindowTitle(title)
    box.setText(text)
    box.setTextFormat(Qt.TextFormat.RichText)
    yes = box.addButton(confirm_text, QMessageBox.ButtonRole.YesRole)
    box.addButton("Cancelar", QMessageBox.ButtonRole.NoRole)
    icon = "alert" if dangerous else "info"
    box.setIconPixmap(icons.pixmap(icon, "danger" if dangerous else "accent", 40))
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
        lay.setContentsMargins(20, 18, 20, 18)
        lay.setSpacing(12)

        header = QLabel(title)
        header.setStyleSheet(f"color: {theme.TEXT}; font-size: 15px; font-weight: 800;")
        lay.addWidget(header)

        self.list = QListWidget()
        self.list.setStyleSheet(
            f"""
            QListWidget {{
                background: {theme.PANEL}; border: 1px solid {theme.BORDER};
                border-radius: 10px; padding: 6px;
            }}
            QListWidget::item {{ padding: 8px; border-radius: 6px; }}
            """
        )
        lay.addWidget(self.list, 1)

        from PySide6.QtWidgets import QProgressBar

        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        lay.addWidget(self.progress)

        self.status = QLabel("Preparando…")
        self.status.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        lay.addWidget(self.status)

        self.close_btn = QPushButton("Concluído")
        self.close_btn.setProperty("accent", True)
        self.close_btn.setEnabled(False)
        self.close_btn.clicked.connect(self.accept)
        lay.addWidget(self.close_btn, 0, Qt.AlignmentFlag.AlignRight)

    def set_total(self, total: int) -> None:
        self._total = max(1, total)
        self._done = 0
        self.progress.setValue(0)

    def begin_step(self, name: str) -> None:
        self.status.setText(f"Executando: {name}")
        item = QListWidgetItem(f"⏳  {name}")
        self.list.addItem(item)
        self.list.scrollToBottom()

    def step_done(self, name: str, ok: bool, message: str) -> None:
        self._done += 1
        self.progress.setValue(int(self._done / self._total * 100))
        mark = "✔" if ok else "✖"
        row = self.list.count() - 1
        if row >= 0:
            item = self.list.item(row)
            base = item.text().split("  ", 1)[-1]
            item.setText(f"{mark}  {base} — {message}")

    def finish(self, summary: str) -> None:
        self.status.setText(summary)
        self.progress.setValue(100)
        self.close_btn.setEnabled(True)
