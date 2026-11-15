"""Ícones em SVG inline — traço 1.75px, terminações arredondadas.

Renderizados via QtSvg e recoloridos pelo tema (qualquer hex/tamanho).
Nenhum arquivo externo; nada de emojis como ícones.
"""

from __future__ import annotations

from PySide6.QtCore import QByteArray, QRectF, Qt
from PySide6.QtGui import QIcon, QImage, QPainter, QPainterPath, QPixmap
from PySide6.QtSvg import QSvgRenderer

from nexus.ui import theme

# Cores por papel — resolvidas dinamicamente para o tema corrente.
_ROLE_COLORS = {
    "accent": lambda: theme.ACCENT,
    "accent_text": lambda: theme.ACCENT_TEXT,
    "text": lambda: theme.TEXT,
    "muted": lambda: theme.TEXT_MUTED,
    "faint": lambda: theme.TEXT_FAINT,
    "success": lambda: theme.SUCCESS,
    "warning": lambda: theme.WARNING,
    "danger": lambda: theme.DANGER,
    "info": lambda: theme.INFO,
    "on_accent": lambda: theme.ON_ACCENT,
}

_SVG = """<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'
   fill='none' stroke='{color}' stroke-width='1.75' stroke-linecap='round'
   stroke-linejoin='round'>{body}</svg>"""

_BODIES = {
    # ---- navegação / estrutura
    "dashboard": "<rect x='3.5' y='3.5' width='7' height='7' rx='2'/><rect x='13.5' y='3.5' width='7' height='4.5' rx='2'/><rect x='13.5' y='11' width='7' height='9.5' rx='2'/><rect x='3.5' y='13.5' width='7' height='7' rx='2'/>",
    "panel_left": "<rect x='3.5' y='4.5' width='17' height='15' rx='2.5'/><path d='M9.5 4.5v15'/>",
    "gauge": "<path d='M5.5 18.5a9 9 0 1 1 13 0'/><path d='M12 15l4.5-5.5'/><circle cx='12' cy='15.5' r='1.1'/>",
    "list": "<path d='M8.5 6h12M8.5 12h12M8.5 18h12M3.8 6h.01M3.8 12h.01M3.8 18h.01'/>",
    "sliders": "<path d='M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3'/><path d='M1.5 14h5M9.5 8h5M17.5 16h5'/>",
    "settings": "<circle cx='12' cy='12' r='3.2'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2'/>",
    "search": "<circle cx='11' cy='11' r='7'/><path d='M21 21l-4.35-4.35'/>",
    "filter": "<path d='M22 3H2l8 9.5V19l4 2v-8.5L22 3z'/>",
    "clock": "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
    "history": "<path d='M3 3v6h6'/><path d='M3.5 13a9 9 0 1 0 2-9.5L3 7'/><path d='M12 7v5l4 2'/>",
    # ---- sistema / desempenho
    "zap": "<path d='M13 2 3 14h9l-1 8 10-12h-9l1-8z'/>",
    "bolt_filled": "<path d='M13 2 3 14h9l-1 8 10-12h-9l1-8z' fill='{color}' stroke='none'/>",
    "cpu": "<rect x='5' y='5' width='14' height='14' rx='2.5'/><rect x='9.5' y='9.5' width='5' height='5' rx='1'/><path d='M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3'/>",
    "gpu": "<rect x='3' y='4.5' width='18' height='12' rx='2.5'/><path d='M6.5 12l2.5-3 2 2 2.5-3.5L16 12'/><path d='M8 21h8M12 16.5V21'/>",
    "ram": "<rect x='3' y='6.5' width='18' height='9.5' rx='2'/><path d='M6.5 16v3M10.5 16v3M14.5 16v3M18.5 16v3M6.5 10.5h2M11 10.5h2M15.5 10.5h2'/>",
    "disk": "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='2.5'/><path d='M15.9 8.1l-2.4 2.4'/>",
    "thermometer": "<path d='M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0z'/><path d='M12 9v7'/>",
    "fan": "<circle cx='12' cy='12' r='2'/><path d='M12 10c0-3 1-6 4-7 1.5 2 .5 5-2 7M14 12c3 0 6 1 7 4-2 1.5-5 .5-7-2M10 14c0 3-1 6-4 7-1.5-2-.5-5 2-7M10 12c-3 0-6-1-7-4 2-1.5 5-.5 7 2'/>",
    "power": "<path d='M12 2v9'/><path d='M18.36 6.64a9 9 0 1 1-12.73 0'/>",
    "windows": "<rect x='3' y='3' width='8' height='8' rx='1.5'/><rect x='13' y='3' width='8' height='8' rx='1.5'/><rect x='3' y='13' width='8' height='8' rx='1.5'/><rect x='13' y='13' width='8' height='8' rx='1.5'/>",
    "server": "<rect x='3' y='3.5' width='18' height='7' rx='2'/><rect x='3' y='13.5' width='18' height='7' rx='2'/><path d='M7 7h.01M7 17h.01'/>",
    "activity": "<path d='M22 12h-4l-3 9L9 3l-3 9H2'/>",
    # ---- rede
    "globe": "<circle cx='12' cy='12' r='9.5'/><path d='M2.5 12h19'/><path d='M12 2.5a15.3 15.3 0 0 1 4 9.5 15.3 15.3 0 0 1-4 9.5 15.3 15.3 0 0 1-4-9.5 15.3 15.3 0 0 1 4-9.5z'/>",
    "download": "<path d='M12 3v12M7 10l5 5 5-5'/><path d='M4 21h16'/>",
    "upload": "<path d='M12 21V9M7 14l5-5 5 5'/><path d='M4 3h16'/>",
    "shield": "<path d='M12 2.5l8 3.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3.5z'/>",
    "shield_check": "<path d='M12 2.5l8 3.5v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3.5z'/><path d='M9 12l2 2 4-4'/>",
    # ---- ações
    "play": "<path d='M6.5 4.5l13 7.5-13 7.5v-15z'/>",
    "pause": "<path d='M8.5 5v14M15.5 5v14'/>",
    "stop": "<rect x='6' y='6' width='12' height='12' rx='2'/>",
    "refresh": "<path d='M21 12a9 9 0 1 1-2.64-6.36L21 8'/><path d='M21 3v5h-5'/>",
    "check": "<path d='M4 12.5l5 5L20 6.5'/>",
    "x": "<path d='M6 6l12 12M18 6L6 18'/>",
    "check_circle": "<circle cx='12' cy='12' r='9'/><path d='M8.5 12.5l2.5 2.5 5-5.5'/>",
    "x_circle": "<circle cx='12' cy='12' r='9'/><path d='M9 9l6 6M15 9l-6 6'/>",
    "alert": "<path d='M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/><path d='M12 9v4M12 17h.01'/>",
    "info": "<circle cx='12' cy='12' r='9'/><path d='M12 16v-4M12 8h.01'/>",
    "plus": "<path d='M12 5v14M5 12h14'/>",
    "edit": "<path d='M17 3l4 4L8 20l-5 1 1-5L17 3z'/>",
    "trash": "<path d='M3.5 6h17'/><path d='M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2'/><path d='M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14'/><path d='M10 11v6M14 11v6'/>",
    "folder": "<path d='M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z'/>",
    "undo": "<path d='M3 7v6h6'/><path d='M21 17a9 9 0 0 0-15-6.7L3 13'/>",
    "broom": "<path d='M19.4 14.6L14 9.2l5-5c.6-.6 1.5-.6 2.1 0l1.3 1.3c.6.6.6 1.5 0 2.1l-5 5z'/><path d='M14 9.2l-8.6 8.6c-.8.8-.8 2 0 2.8l1.1 1.1c.8.8 2 .8 2.8 0L18 13'/>",
    "rocket": "<path d='M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z'/><path d='M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z'/><path d='M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0'/><path d='M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'/>",
    "star": "<path d='M12 2.5l3 6.06 6.72.98-4.86 4.73 1.15 6.68L12 17.77l-6.01 3.18 1.15-6.68L2.28 9.54l6.72-.98L12 2.5z'/>",
    "lock": "<rect x='4.5' y='10.5' width='15' height='10' rx='2.5'/><path d='M8 10.5V7a4 4 0 0 1 8 0v3.5'/>",
    "gamepad": "<rect x='2' y='7' width='20' height='11' rx='5.5'/><path d='M7 10.5v4M5 12.5h4'/><circle cx='16' cy='11' r='1'/><circle cx='18.5' cy='13.5' r='1'/>",
    # ---- indicadores
    "chevron_left": "<path d='M15 6l-6 6 6 6'/>",
    "chevron_right": "<path d='M9 6l6 6-6 6'/>",
    "chevron_down": "<path d='M6 9l6 6 6-6'/>",
    "arrow_up": "<path d='M12 19V5M6 11l6-6 6 6'/>",
    "arrow_down": "<path d='M12 5v14M6 13l6 6 6-6'/>",
    "trend_up": "<path d='M3 17l6-6 4 4 8-8'/><path d='M15 7h6v6'/>",
    "trend_down": "<path d='M3 7l6 6 4-4 8 8'/><path d='M15 17h6v-6'/>",
    "moon": "<path d='M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z'/>",
    "sun": "<circle cx='12' cy='12' r='4'/><path d='M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8'/>",
    "monitor": "<rect x='2.5' y='4' width='19' height='12.5' rx='2'/><path d='M9 20.5h6M12 16.5v4'/>",
    "user": "<circle cx='12' cy='8' r='4'/><path d='M4.5 21a7.5 7.5 0 0 1 15 0'/>",
}

_cache: dict = {}


def _role_color(color: str) -> str:
    fn = _ROLE_COLORS.get(color)
    return fn() if fn else color


def _render(name: str, color: str, size: int) -> QPixmap:
    key = (name, color, size, theme.MODE)
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
    """Ícone por nome; ``color`` é um papel ('accent', 'muted'…) ou hex."""
    return QIcon(pixmap(name, color, size))


def pixmap(name: str, color: str = "accent", size: int = 24) -> QPixmap:
    return _render(name, _role_color(color), size)


def _rounded(pm: QPixmap, radius: int) -> QPixmap:
    out = QPixmap(pm.size())
    out.fill(Qt.GlobalColor.transparent)
    p = QPainter(out)
    p.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    path = QPainterPath()
    path.addRoundedRect(QRectF(0, 0, pm.width(), pm.height()), radius, radius)
    p.setClipPath(path)
    p.drawPixmap(0, 0, pm)
    p.end()
    return out


def brand_pixmap(size: int) -> QPixmap:
    """Marca oficial do app: assets/icon.png (badge circular com transparência).

    Fallbacks: brand.jpg em quadrado arredondado → ícone 'bolt_filled'.
    """
    from nexus.core.paths import asset_path

    pm = QPixmap()
    icon_file = asset_path("icon.png")
    if icon_file.is_file():
        pm.load(str(icon_file))
        if not pm.isNull():
            return pm.scaled(size, size, Qt.AspectRatioMode.KeepAspectRatio,
                             Qt.TransformationMode.SmoothTransformation)
    if asset_path("brand.jpg").is_file():
        pm.load(str(asset_path("brand.jpg")))
    if pm.isNull():
        return pixmap("bolt_filled", "accent", size)
    pm = pm.scaled(size, size, Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                   Qt.TransformationMode.SmoothTransformation)
    return _rounded(pm, max(6, size // 5))


NAMES = list(_BODIES.keys())
