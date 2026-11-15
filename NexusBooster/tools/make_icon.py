#!/usr/bin/env python3
"""Gera o ícone .ico do aplicativo a partir do assets/logo.svg.

Requisitos (apenas em tempo de build): PySide6 (QtSvg) e Pillow.
Uso:  python tools/make_icon.py [saída]
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "assets" / "logo.svg"


def main() -> int:
    from PySide6.QtCore import QByteArray, QRectF, Qt
    from PySide6.QtGui import QImage, QPainter
    from PySide6.QtSvg import QSvgRenderer

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "icon.ico"

    renderer = QSvgRenderer(QByteArray(SVG.read_bytes()))
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    for size in sizes:
        img = QImage(size, size, QImage.Format.Format_ARGB32)
        img.fill(Qt.GlobalColor.transparent)
        p = QPainter(img)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        renderer.render(p, QRectF(0, 0, size, size))
        p.end()
        images.append(img)

    try:
        from PIL import Image  # noqa: PLC0415

        pil_images = [
            Image.fromarray(
                __import__("numpy", fromlist=["array"]).frombuffer(
                    img.constBits(), dtype=__import__("numpy").uint8
                ).reshape(img.height(), img.width(), 4).copy()
            )
            for img in images
        ]
        pil_images[0].save(out, format="ICO", append_images=pil_images[1:])
    except ImportError:
        # Sem Pillow/numpy: salva o PNG 256 como fallback
        images[-1].save(str(out.with_suffix(".png")))
        print(f"Pillow ausente — PNG salvo em {out.with_suffix('.png')}")
        return 0

    print(f"Ícone gerado: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
