"""Splash minimalista: marca + barra fina de progresso, sem peso."""

from __future__ import annotations

import time
from typing import Optional

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QPixmap
from PySide6.QtWidgets import QWidget

from nexus import __version__
from nexus.core.paths import asset_path
from nexus.ui import theme


class NexusSplash(QWidget):
    """Splash leve — logo, nome do app e barra fina indeterminada."""

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.SplashScreen | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setFixedSize(420, 220)
        self._start = time.time()
        self._brand = QPixmap()
        if asset_path("brand.jpg").is_file():
            self._brand.load(str(asset_path("brand.jpg")))
        self._msg = ""

        # animação da barra (pausa quando a janela não está visível)
        from PySide6.QtCore import QTimer

        self._tick = QTimer(self)
        self._tick.setInterval(60)
        self._tick.timeout.connect(self.update)

    def showEvent(self, event) -> None:
        if theme.dur("fast") > 0:
            self._tick.start()
        super().showEvent(event)

    def hideEvent(self, event) -> None:
        self._tick.stop()
        super().hideEvent(event)

    def message(self, text: str) -> None:
        self._msg = text
        self.repaint()

    def elapsed(self) -> float:
        return time.time() - self._start

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        # superfície com borda sutil
        p.setPen(QPen(QColor(theme.BORDER_STRONG), 1))
        p.setBrush(QColor(theme.SURFACE1))
        p.drawRoundedRect(QRectF(0.5, 0.5, w - 1, h - 1), 12, 12)

        # marca (círculo com anel de accent)
        if not self._brand.isNull():
            size = 84
            x, y = (w - size) // 2, 26
            acc = QColor(theme.ACCENT)
            p.setPen(QPen(QColor(acc.red(), acc.green(), acc.blue(), 90), 1.5))
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawEllipse(QRectF(x - 6, y - 6, size + 12, size + 12))
            p.drawPixmap(x, y, size, size, self._brand)

        # nome
        f = QFont()
        f.setFamilies(["Segoe UI Variable Display", "Segoe UI", "Inter", "Noto Sans"])
        f.setPixelSize(20)
        f.setWeight(QFont.Weight.DemiBold)
        p.setFont(f)
        p.setPen(QColor(theme.TEXT))
        p.drawText(QRectF(0, 124, w, 26), Qt.AlignmentFlag.AlignHCenter, "Nexus Booster")
        p.setFont(QFont())
        fp = QFont()
        fp.setPixelSize(11)
        p.setFont(fp)
        p.setPen(QColor(theme.TEXT_FAINT))
        p.drawText(QRectF(0, 150, w, 18), Qt.AlignmentFlag.AlignHCenter,
                   f"v{__version__} — Otimizador de Desempenho")

        # barra fina de progresso indeterminada (varredura de ida e volta)
        bar_y = 186
        track = QRectF(36, bar_y, w - 72, 3)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(theme.BORDER))
        p.drawRoundedRect(track, 1.5, 1.5)
        t = (time.time() - self._start) * 0.9
        span = track.width() * 0.32
        phase = t % 2.0
        pos = phase if phase <= 1.0 else 2.0 - phase
        x0 = track.x() + (track.width() - span) * pos
        p.setBrush(QColor(theme.ACCENT))
        p.drawRoundedRect(QRectF(x0, bar_y, span, 3), 1.5, 1.5)

        # mensagem
        if self._msg:
            fm = QFont()
            fm.setPixelSize(11)
            p.setFont(fm)
            p.setPen(QColor(theme.TEXT_MUTED))
            p.drawText(QRectF(0, bar_y + 8, w, 16), Qt.AlignmentFlag.AlignHCenter, self._msg)
        p.end()
