#!/usr/bin/env python3
"""Gera o ícone .ico do aplicativo.

Prioridade: assets/brand.jpg (imagem da marca) → assets/logo.svg (fallback).
Requisitos (apenas em tempo de build): PySide6 e Pillow.
Uso:  python tools/make_icon.py [saída]
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "assets" / "icon.png"
BRAND = ROOT / "assets" / "brand.jpg"
SVG = ROOT / "assets" / "logo.svg"


def _render_icon(size: int):
    """Ícone oficial do aplicativo (assets/icon.png), mantendo transparência."""
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QImage

    if not ICON.is_file():
        return None
    src = QImage(str(ICON))
    if src.isNull():
        return None
    return src.scaled(
        size, size,
        Qt.AspectRatioMode.KeepAspectRatio,
        Qt.TransformationMode.SmoothTransformation,
    )


def _render_brand(size: int):
    """Ícone a partir da imagem da marca (fundo escuro + cantos arredondados).

    Usa apenas QImage/QPainter — sem QPixmap, portanto não exige
    QApplication (importante: roda como ferramenta de build no CI).
    """
    from PySide6.QtCore import QRectF, Qt
    from PySide6.QtGui import QBrush, QColor, QImage, QLinearGradient, QPainter, QPainterPath, QPen

    src = QImage(str(BRAND))
    if src.isNull():
        return None
    img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
    img.fill(Qt.GlobalColor.transparent)
    p = QPainter(img)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    margin = max(1, size // 16)
    radius = max(2, size // 5)
    rect = QRectF(margin, margin, size - 2 * margin, size - 2 * margin)
    path = QPainterPath()
    path.addRoundedRect(rect, radius, radius)
    # fundo escuro + brilho
    grad = QLinearGradient(rect.topLeft(), rect.bottomRight())
    grad.setColorAt(0.0, QColor("#101827"))
    grad.setColorAt(1.0, QColor("#0a0e17"))
    p.fillPath(path, QBrush(grad))
    # imagem central (cover, 92% da área)
    inner = rect.adjusted(rect.width() * 0.04, rect.height() * 0.04,
                          -rect.width() * 0.04, -rect.height() * 0.04)
    scaled = src.scaled(
        int(inner.width()), int(inner.height()),
        Qt.AspectRatioMode.KeepAspectRatioByExpanding,
        Qt.TransformationMode.SmoothTransformation,
    )
    p.setClipPath(path)
    p.drawImage(
        int(inner.x() + (inner.width() - scaled.width()) / 2),
        int(inner.y() + (inner.height() - scaled.height()) / 2),
        scaled,
    )
    # borda neon
    acc = QColor("#00d4ff")
    pen = QPen(QColor(acc.red(), acc.green(), acc.blue(), 200), max(1.0, size / 32.0))
    p.setPen(pen)
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.setClipping(False)
    p.drawPath(path)
    p.end()
    return img


def _render_svg(size: int):
    from PySide6.QtCore import QByteArray, QRectF, Qt
    from PySide6.QtGui import QImage, QPainter
    from PySide6.QtSvg import QSvgRenderer

    renderer = QSvgRenderer(QByteArray(SVG.read_bytes()))
    img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
    img.fill(Qt.GlobalColor.transparent)
    p = QPainter(img)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    renderer.render(p, QRectF(0, 0, size, size))
    p.end()
    return img


def main() -> int:
    from PySide6.QtCore import QBuffer, QIODevice

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "icon.ico"

    sizes = [16, 24, 32, 48, 64, 128, 256]
    png_bytes: list[bytes] = []
    for size in sizes:
        img = _render_icon(size) or (_render_brand(size) if BRAND.is_file() else None)
        if img is None:
            img = _render_svg(size)
        buf = QBuffer()
        buf.open(QIODevice.OpenModeFlag.WriteOnly)
        img.save(buf, "PNG")
        png_bytes.append(bytes(buf.data()))
        buf.close()

    try:
        from PIL import Image  # noqa: PLC0415

        pil_images = [Image.open(io.BytesIO(b)).convert("RGBA") for b in png_bytes]
        # A imagem base do .ico deve ser a MAIOR: o Pillow descarta tamanhos
        # maiores que a imagem base ao montar o arquivo.
        pil_images.sort(key=lambda im2: im2.width, reverse=True)
        pil_images[0].save(out, format="ICO", append_images=pil_images[1:])
        print(f"Ícone gerado: {out}")
    except ImportError:
        out.with_suffix(".png").write_bytes(png_bytes[-1])
        print(f"Pillow ausente — PNG 256px salvo em {out.with_suffix('.png')}")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())

