"""Splash screen de abertura com a imagem da marca e borda neon."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QFont, QLinearGradient, QPainter, QPainterPath, QPen, QPixmap
from PySide6.QtWidgets import QSplashScreen, QWidget

from nexus import __version__
from nexus.core.paths import asset_path
from nexus.ui import icons, theme


def _compose_splash(brand: QPixmap, width: int = 560) -> QPixmap:
    """Monta o pixmap do splash: fundo escuro + marca centralizada + neon."""
    pm = QPixmap(width, 340)
    pm.fill(QColor(theme.BG))

    p = QPainter(pm)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)

    # brilho de fundo (aurora azul sutil)
    aurora = QLinearGradient(0, 0, width, 340)
    aurora.setColorAt(0.0, QColor(0, 130, 190, 26))
    aurora.setColorAt(0.5, QColor(0, 90, 140, 10))
    aurora.setColorAt(1.0, QColor(0, 130, 190, 26))
    p.fillRect(pm.rect(), QBrush(aurora))

    # marca centralizada com anel neon
    if not brand.isNull():
        size = 210
        x, y = (width - size) // 2, 26
        ring = QRectF(x - 7, y - 7, size + 14, size + 14)
        acc = QColor(theme.ACCENT)
        p.setPen(QPen(QColor(acc.red(), acc.green(), acc.blue(), 60), 5))
        p.drawEllipse(ring.adjusted(2, 2, -2, -2))
        p.setPen(QPen(acc, 1.4))
        p.drawEllipse(ring)
        p.drawPixmap(x, y, size, size, brand)
    else:
        ic = icons.pixmap("bolt_filled", "accent", 120)
        p.drawPixmap((width - 120) // 2, 60, ic)

    # textos
    f = QFont()
    f.setPointSizeF(15)
    f.setBold(True)
    f.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 3)
    p.setFont(f)
    p.setPen(QColor(theme.TEXT))
    p.drawText(QRectF(0, 252, width, 30), Qt.AlignmentFlag.AlignHCenter, "NEXUS ")
    p.setPen(QColor(theme.ACCENT))
    p.drawText(QRectF(0, 252, width, 30), Qt.AlignmentFlag.AlignHCenter, "      BOOSTER")

    f2 = QFont()
    f2.setPointSizeF(9)
    p.setFont(f2)
    p.setPen(QColor(theme.TEXT_FAINT))
    p.drawText(
        QRectF(0, 288, width, 20), Qt.AlignmentFlag.AlignHCenter,
        f"v{__version__} — Otimizador de Desempenho",
    )

    # linha neon inferior
    line = QLinearGradient(0, 0, width, 0)
    acc = QColor(theme.ACCENT)
    line.setColorAt(0.0, QColor(acc.red(), acc.green(), acc.blue(), 0))
    line.setColorAt(0.5, QColor(acc.red(), acc.green(), acc.blue(), 200))
    line.setColorAt(1.0, QColor(acc.red(), acc.green(), acc.blue(), 0))
    p.fillRect(0, 336, width, 2, QBrush(line))
    p.end()
    return pm


class NexusSplash(QSplashScreen):
    """Splash com fade de entrada e mensagens de carregamento."""

    def __init__(self, parent: Optional[QWidget] = None):
        brand = QPixmap()
        brand_path = asset_path("brand.jpg")
        if brand_path.is_file():
            brand.load(str(brand_path))
        self._pixmap = _compose_splash(brand)
        super().__init__(self._pixmap)
        self.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 11px;")
        self._start = time.time()

    def message(self, text: str) -> None:
        self.showMessage(
            text,
            Qt.AlignmentFlag.AlignBottom | Qt.AlignmentFlag.AlignHCenter,
            QColor(theme.ACCENT),
        )

    def elapsed(self) -> float:
        return time.time() - self._start
