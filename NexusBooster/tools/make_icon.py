#!/usr/bin/env python3
"""Gera o ícone .ico do aplicativo a partir do assets/logo.svg.

Requisitos (apenas em tempo de build): PySide6 (QtSvg) e Pillow.
Uso:  python tools/make_icon.py [saída]
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "assets" / "logo.svg"


def main() -> int:
    from PySide6.QtCore import QBuffer, QByteArray, QIODevice, QRectF, Qt
    from PySide6.QtGui import QImage, QPainter
    from PySide6.QtSvg import QSvgRenderer

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "icon.ico"

    renderer = QSvgRenderer(QByteArray(SVG.read_bytes()))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    png_bytes: list[bytes] = []
    for size in sizes:
        img = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
        img.fill(Qt.GlobalColor.transparent)
        p = QPainter(img)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        renderer.render(p, QRectF(0, 0, size, size))
        p.end()
        buf = QBuffer()
        buf.open(QIODevice.OpenModeFlag.WriteOnly)
        img.save(buf, "PNG")
        png_bytes.append(bytes(buf.data()))
        buf.close()

    try:
        from PIL import Image  # noqa: PLC0415

        pil_images = [Image.open(io.BytesIO(b)).convert("RGBA") for b in png_bytes]
        pil_images[0].save(out, format="ICO", append_images=pil_images[1:])
        print(f"Ícone gerado: {out}")
    except ImportError:
        out.with_suffix(".png").write_bytes(png_bytes[-1])
        print(f"Pillow ausente — PNG 256px salvo em {out.with_suffix('.png')}")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
