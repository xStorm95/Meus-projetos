"""Ícones minimalistas em SVG (renderizados em qualquer cor/tamanho)."""

from __future__ import annotations

from PySide6.QtCore import QByteArray, QRectF, Qt
from PySide6.QtGui import QIcon, QImage, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer

_ICON_COLORS = {
    "accent": "#00d4ff",
    "text": "#e6edf7",
    "muted": "#8b98ad",
    "success": "#2dd4a7",
    "warning": "#fbbf24",
    "danger": "#f87171",
}

_SVG = """
<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'
   fill='none' stroke='{color}' stroke-width='2' stroke-linecap='round'
   stroke-linejoin='round'>{body}</svg>
"""

_BODIES = {
    "dashboard": "<rect x='3' y='3' width='8' height='8' rx='1.5'/><rect x='13' y='3' width='8' height='5' rx='1.5'/><rect x='13' y='10' width='8' height='11' rx='1.5'/><rect x='3' y='13' width='8' height='8' rx='1.5'/>",
    "gauge": "<path d='M5.5 18.5a9 9 0 1 1 13 0'/><path d='M12 15l4.5-5.5'/><circle cx='12' cy='15.5' r='1.1'/>",
    "zap": "<path d='M13 2 3 14h9l-1 8 10-12h-9l1-8z'/>",
    "gamepad": "<rect x='2' y='7' width='20' height='11' rx='5.5'/><path d='M7 10.5v4M5 12.5h4'/><circle cx='16' cy='11' r='1'/><circle cx='18.5' cy='13.5' r='1'/>",
    "activity": "<path d='M22 12h-4l-3 9L9 3l-3 9H2'/>",
    "cpu": "<rect x='5' y='5' width='14' height='14' rx='2'/><rect x='9.5' y='9.5' width='5' height='5' rx='1'/><path d='M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3'/>",
    "gpu": "<rect x='3' y='4' width='18' height='12' rx='2'/><path d='M6.5 12l2.5-3 2 2 2.5-3.5L16 12'/><path d='M8 21h8M12 16v5'/>",
    "ram": "<rect x='3' y='6.5' width='18' height='9.5' rx='1.5'/><path d='M6 16v3M10 16v3M14 16v3M18 16v3M6.5 10h2M11 10h2M15.5 10h2'/>",
    "disk": "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='2.5'/><path d='M15.9 8.1l-2.4 2.4'/>",
    "thermometer": "<path d='M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z'/><path d='M12 8v8'/>",
    "globe": "<circle cx='12' cy='12' r='10'/><path d='M2 12h20'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/>",
    "power": "<path d='M12 2v9'/><path d='M18.36 6.64a9 9 0 1 1-12.73 0'/>",
    "list": "<path d='M8.5 6h12M8.5 12h12M8.5 18h12M3.8 6h.01M3.8 12h.01M3.8 18h.01'/>",
    "sliders": "<path d='M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3'/><path d='M1.5 14h5M9.5 8h5M17.5 16h5'/>",
    "clock": "<circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/>",
    "settings": "<circle cx='12' cy='12' r='3.2'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2'/>",
    "trash": "<path d='M3 6h18'/><path d='M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2'/><path d='M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14'/><path d='M10 11v6M14 11v6'/>",
    "star": "<path d='M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z'/>",
    "play": "<path d='M6 4l14 8-14 8V4z'/>",
    "pause": "<path d='M8 5v14M16 5v14'/>",
    "stop": "<rect x='6' y='6' width='12' height='12' rx='1.5'/>",
    "refresh": "<path d='M21 12a9 9 0 1 1-2.64-6.36L21 8'/><path d='M21 3v5h-5'/>",
    "shield": "<path d='M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z'/>",
    "shield_check": "<path d='M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z'/><path d='M9 12l2 2 4-4'/>",
    "check": "<path d='M4 12l5 5L20 7'/>",
    "x": "<path d='M6 6l12 12M18 6L6 18'/>",
    "alert": "<path d='M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/><path d='M12 9v4M12 17h.01'/>",
    "info": "<circle cx='12' cy='12' r='10'/><path d='M12 16v-4M12 8h.01'/>",
    "search": "<circle cx='11' cy='11' r='7'/><path d='M21 21l-4.35-4.35'/>",
    "download": "<path d='M12 3v12M7 10l5 5 5-5'/><path d='M4 21h16'/>",
    "upload": "<path d='M12 21V9M7 14l5-5 5 5'/><path d='M4 3h16'/>",
    "plus": "<path d='M12 5v14M5 12h14'/>",
    "edit": "<path d='M17 3l4 4L8 20l-5 1 1-5L17 3z'/>",
    "folder": "<path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'/>",
    "undo": "<path d='M3 7v6h6'/><path d='M21 17a9 9 0 0 0-15-6.7L3 13'/>",
    "server": "<rect x='3' y='3' width='18' height='7' rx='2'/><rect x='3' y='14' width='18' height='7' rx='2'/><path d='M7 6.5h.01M7 17.5h.01'/>",
    "fan": "<circle cx='12' cy='12' r='2'/><path d='M12 10c0-3 1-6 4-7 1.5 2 .5 5-2 7M14 12c3 0 6 1 7 4-2 1.5-5 .5-7-2M10 14c0 3-1 6-4 7-1.5-2-.5-5 2-7M10 12c-3 0-6-1-7-4 2-1.5 5-.5 7 2'/>",
    "windows": "<rect x='3' y='3' width='8' height='8' rx='1'/><rect x='13' y='3' width='8' height='8' rx='1'/><rect x='3' y='13' width='8' height='8' rx='1'/><rect x='13' y='13' width='8' height='8' rx='1'/>",
    "filter": "<path d='M22 3H2l8 9.5V19l4 2v-8.5L22 3z'/>",
    "bolt_filled": "<path d='M13 2 3 14h9l-1 8 10-12h-9l1-8z' fill='{color}' stroke='none'/>",
    "rocket": "<path d='M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z'/><path d='M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z'/><path d='M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0'/><path d='M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'/>",
    "history": "<path d='M3 3v6h6'/><path d='M3.5 13a9 9 0 1 0 2-9.5L3 7'/><path d='M12 7v5l4 2'/>",
    "broom": "<path d='M19.4 14.6L14 9.2l5-5c.6-.6 1.5-.6 2.1 0l1.3 1.3c.6.6.6 1.5 0 2.1l-5 5z'/><path d='M14 9.2l-8.6 8.6c-.8.8-.8 2 0 2.8l1.1 1.1c.8.8 2 .8 2.8 0L18 13'/>",
}

_cache: dict = {}


def _render(name: str, color: str, size: int) -> QPixmap:
    key = (name, color, size)
    if key in _cache:
        return _cache[key]

    body = _BODIES[name].replace("{color}", color)
    svg = _SVG.format(color=color, body=body)
    renderer = QSvgRenderer(QByteArray(svg.encode("utf-8")))
    image = QImage(size, size, QImage.Format.Format_ARGB32_Premultiplied)
    image.fill(Qt.GlobalColor.transparent)
    painter = QPainter(image)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    renderer.render(painter, QRectF(0, 0, size, size))
    painter.end()

    pm = QPixmap.fromImage(image)
    _cache[key] = pm
    return pm


def icon(name: str, color: str = "accent", size: int = 24) -> QIcon:
    """Ícone por nome; color pode ser uma chave ('accent') ou um hex."""
    hexcolor = _ICON_COLORS.get(color, color)
    return QIcon(_render(name, hexcolor, size))


def pixmap(name: str, color: str = "accent", size: int = 24) -> QPixmap:
    hexcolor = _ICON_COLORS.get(color, color)
    return _render(name, hexcolor, size)


NAMES = list(_BODIES.keys())
