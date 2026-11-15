"""Sistema de design do DK: tokens, paletas e geração de QSS.

Tokens semânticos (dark/light), derivação de accent (hover/pressed/subtle),
escala de espaçamento/raios/durações, detecção de "reduzir animações" do
Windows, preferência de tema do sistema e tentativa de Mica via DWM.

Tudo aqui é derivado dos tokens — nenhuma aba define cor própria.
"""

from __future__ import annotations

import ctypes
import sys
from dataclasses import dataclass, replace
from typing import Dict, Optional

from PySide6.QtCore import QObject, Signal
from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication, QWidget

from nexus.constants import ACCENTS, DEFAULT_ACCENT

# ------------------------------------------------------------------ escala

FONT_STACK = (
    '"Segoe UI Variable Text", "Segoe UI", "Inter", "Ubuntu", "Noto Sans", sans-serif'
)
MONO_STACK = '"Cascadia Mono", "Consolas", "DejaVu Sans Mono", monospace'

FS: Dict[str, int] = {  # px — escala fixa
    "caption": 11,
    "body_sm": 12,
    "body": 13,
    "body_lg": 14,
    "title_sm": 16,
    "title": 20,
    "display": 28,
}

RADIUS: Dict[str, int] = {"control": 8, "card": 12, "panel": 16}

SP: Dict[str, int] = {  # grid 4/8
    "xs": 4,
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 24,
    "xxl": 32,
}

DUR: Dict[str, int] = {"fast": 120, "normal": 160, "slow": 200, "toast": 260}

DENSITY: str = "comfortable"  # "comfortable" | "compact"
_DENSITY_MULT = {"comfortable": 1.0, "compact": 0.72}


def pad(key: str) -> int:
    """Espaçamento da escala já convertido pela densidade atual."""
    base = SP.get(key, SP["md"])
    return max(2, int(round(base * _DENSITY_MULT.get(DENSITY, 1.0))))


# ----------------------------------------------------------------- paletas


@dataclass(frozen=True)
class Palette:
    """Tokens semânticos de uma paleta (dark ou light)."""

    name: str
    bg: str
    surface1: str
    surface2: str
    surface3: str
    border: str
    border_strong: str
    text: str
    text_muted: str
    text_faint: str
    text_disabled: str
    success: str
    success_bg: str
    warning: str
    warning_bg: str
    danger: str
    danger_bg: str
    info: str
    info_bg: str
    on_accent_dark: str
    on_accent_light: str


DARK = Palette(
    name="dark",
    bg="#14161b",
    surface1="#1a1d23",
    surface2="#1f232b",
    surface3="#262b35",
    border="#262b35",
    border_strong="#363d4a",
    text="#eceef2",
    text_muted="#a7aebc",
    text_faint="#7d8595",
    text_disabled="#5b6371",
    success="#3fd68f",
    success_bg="#12261e",
    warning="#e8b33c",
    warning_bg="#2a2210",
    danger="#f0777c",
    danger_bg="#2b1518",
    info="#4cc2ff",
    info_bg="#0e2231",
    on_accent_dark="#04222f",
    on_accent_light="#f3fbff",
)

LIGHT = Palette(
    name="light",
    bg="#f4f2fa",          # branco com leve tint roxo (identidade DK)
    surface1="#faf9fd",
    surface2="#ffffff",
    surface3="#f3f1f9",
    border="#e6e2f1",      # bordas com tint roxo
    border_strong="#cfc7e3",
    text="#221a33",        # texto quase-preto com fundo roxo
    text_muted="#55506b",
    text_faint="#736d8c",
    text_disabled="#a49fb8",
    success="#157f4f",
    success_bg="#e3f5ec",
    warning="#8a5a00",
    warning_bg="#fbf0d7",
    danger="#bf353c",
    danger_bg="#fbe4e5",
    info="#0b6f9e",
    info_bg="#e0f2fb",
    on_accent_dark="#04222f",
    on_accent_light="#f3fbff",
)

ACCENT_KEYS = list(ACCENTS.keys())

# Estado corrente -----------------------------------------------------------

MODE: str = "light"
ACCENT: str = ACCENTS[DEFAULT_ACCENT]
_palette: Palette = LIGHT

# Alias compatíveis com o código existente (atualizados por set_theme()).
BG = _palette.bg
SURFACE1 = _palette.surface1
SURFACE2 = _palette.surface2
SURFACE3 = _palette.surface3
PANEL = _palette.surface1
CARD = _palette.surface2
CARD_HOVER = _palette.surface3
BORDER = _palette.border
BORDER_SOFT = _palette.border
BORDER_STRONG = _palette.border_strong
TEXT = _palette.text
TEXT_MUTED = _palette.text_muted
TEXT_FAINT = _palette.text_faint
TEXT_DISABLED = _palette.text_disabled
SUCCESS = _palette.success
WARNING = _palette.warning
DANGER = _palette.danger
INFO = _palette.info
ACCENT_TEXT = ACCENT
ON_ACCENT = _palette.on_accent_dark


# ------------------------------------------------------------------ helpers


def _q(hex_or_color) -> QColor:
    return hex_or_color if isinstance(hex_or_color, QColor) else QColor(hex_or_color)


def _to_hex(c: QColor) -> str:
    return c.name()


def _mix(a: str, b: str, ratio: float) -> str:
    """Mistura duas cores (ratio = peso de b)."""
    ca, cb = _q(a), _q(b)
    r = ca.red() + (cb.red() - ca.red()) * ratio
    g = ca.green() + (cb.green() - ca.green()) * ratio
    bl = ca.blue() + (cb.blue() - ca.blue()) * ratio
    return QColor(int(round(r)), int(round(g)), int(round(bl))).name()


def with_alpha(color: str, alpha: int) -> str:
    """Cor com canal alfa (0-255) em notação rgba() p/ QSS."""
    c = _q(color)
    return f"rgba({c.red()}, {c.green()}, {c.blue()}, {alpha})"


def _luminance(c: QColor) -> float:
    def chan(v: int) -> float:
        x = v / 255.0
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4

    return 0.2126 * chan(c.red()) + 0.7152 * chan(c.green()) + 0.0722 * chan(c.blue())


def contrast_ratio(fg: str, bg: str) -> float:
    lf, lb = _luminance(_q(fg)), _luminance(_q(bg))
    hi, lo = max(lf, lb), min(lf, lb)
    return (hi + 0.05) / (lo + 0.05)


def _ensure_contrast(fg: str, bg: str, target: float = 4.5) -> str:
    """Escurece/clareia a cor até atingir o contraste alvo (usado p/ accent em texto)."""
    c = _q(fg)
    bg_lum = _luminance(_q(bg))
    for _ in range(40):
        if contrast_ratio(c.name(), bg) >= target:
            return c.name()
        if bg_lum > 0.5:
            c = c.darker(108)
        else:
            c = c.lighter(108)
    return c.name()


def accent_for_text() -> str:
    """Accent garantindo contraste de leitura sobre a superfície corrente."""
    return _ensure_contrast(ACCENT, _palette.surface2, 4.5)


def on_accent() -> str:
    """Cor de texto legível sobre o accent (claro→escuro, escuro→claro)."""
    return _palette.on_accent_dark if _luminance(_q(ACCENT)) > 0.35 else _palette.on_accent_light


def accent_hover() -> str:
    base = _q(ACCENT)
    return (base.lighter(112) if _palette.name == "dark" else base.darker(110)).name()


def accent_pressed() -> str:
    base = _q(ACCENT)
    return (base.darker(118) if _palette.name == "dark" else base.lighter(118)).name()


def accent_subtle() -> str:
    """Fundo sutil do accent (itens selecionados, hover de lista)."""
    return with_alpha(ACCENT, 30 if _palette.name == "dark" else 42)


def token(name: str) -> str:
    """Acesso a um token da paleta corrente por nome."""
    return getattr(_palette, name)


def current() -> Palette:
    return _palette


# ------------------------------------------------------- sistema (Windows)


def system_prefers_dark() -> bool:
    """Tema escuro do Windows (AppsUseLightTheme). Fallback: True."""
    if sys.platform != "win32":
        return True
    try:
        import winreg  # noqa: PLC0415

        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        )
        value, _ = winreg.QueryValueEx(key, "AppsUseLightTheme")
        key.Close()
        return int(value) == 0
    except Exception:  # noqa: BLE001
        return True


_reduce_motion_cache: "Optional[bool]" = None


def reduce_motion() -> bool:
    """Respeita 'Mostrar animações no Windows' desativado (cacheado)."""
    global _reduce_motion_cache
    if _reduce_motion_cache is None:
        _reduce_motion_cache = False
        if sys.platform == "win32":
            try:
                value = ctypes.c_int(0)
                res = ctypes.windll.user32.SystemParametersInfoW(0x1042, 0, ctypes.byref(value), 0)
                if res and value.value == 0:
                    _reduce_motion_cache = True
            except Exception:  # noqa: BLE001
                pass
    return _reduce_motion_cache


def dur(key: str) -> int:
    """Duração de animação, 0 quando o usuário pediu reduzir animações."""
    return 0 if reduce_motion() else DUR.get(key, DUR["normal"])


DWMWA_SYSTEMBACKDROP_TYPE = 38
DWMSBT_NONE, DWMSBT_MAINWINDOW = 0, 3  # Mica


def try_enable_mica(widget: QWidget) -> bool:
    """Tenta ativar Mica (Win11 22H2+) na janela. Retorna sucesso.

    Em caso de falha (Windows 10, build antigo, não-Windows) a janela
    permanece com o fundo sólido dos tokens — nenhum efeito parcial.
    """
    if sys.platform != "win32":
        return False
    try:
        hwnd = int(widget.winId())
        value = ctypes.c_int(DWMSBT_MAINWINDOW)
        res = ctypes.windll.dwmapi.DwmSetWindowAttribute(
            hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ctypes.byref(value), 4
        )
        return res == 0
    except Exception:  # noqa: BLE001
        return False


# ------------------------------------------------------------- ThemeManager


class ThemeManager(QObject):
    """Sinal único de mudança de tema/acento/densidade (tempo real)."""

    changed = Signal()

    def emit_change(self) -> None:
        self.changed.emit()


manager = ThemeManager()


# ------------------------------------------------------------------- QSS


def build_qss(pal: Palette, accent: str) -> str:
    acc_text = _ensure_contrast(accent, pal.surface2, 4.5)
    on_acc = pal.on_accent_dark if _luminance(_q(accent)) > 0.35 else pal.on_accent_light
    acc_hover = (
        _q(accent).lighter(112).name() if pal.name == "dark" else _q(accent).darker(110).name()
    )
    acc_pressed = (
        _q(accent).darker(118).name() if pal.name == "dark" else _q(accent).lighter(118).name()
    )
    acc_subtle = with_alpha(accent, 30 if pal.name == "dark" else 42)
    sel_bg = with_alpha(accent, 46 if pal.name == "dark" else 60)
    focus = with_alpha(accent, 160)
    v = dict(
        pal=pal, accent=accent, acc_text=acc_text, on_acc=on_acc, acc_hover=acc_hover,
        acc_pressed=acc_pressed, acc_subtle=acc_subtle, sel_bg=sel_bg, focus=focus,
        font=FONT_STACK, mono=MONO_STACK,
        fs_caption=FS["caption"], fs_body=FS["body"], fs_body_sm=FS["body_sm"],
        fs_body_lg=FS["body_lg"], fs_title_sm=FS["title_sm"], fs_title=FS["title"],
        r_ctrl=RADIUS["control"], r_card=RADIUS["card"], r_panel=RADIUS["panel"],
        pad_sm=pad("sm"), pad_md=pad("md"), pad_lg=pad("lg"),
        hover_row=with_alpha("#ffffff", 10) if pal.name == "dark" else with_alpha("#000000", 8),
    )
    return _QSS_TEMPLATE.format(**v)


_QSS_TEMPLATE = """
* {{
    font-family: {font};
    outline: none;
}}
QMainWindow, QDialog {{ background: {pal.bg}; }}
QWidget {{ color: {pal.text}; font-size: {fs_body}px; }}
QToolTip {{
    background: {pal.surface3}; color: {pal.text};
    border: 1px solid {pal.border_strong}; padding: 6px 10px;
    border-radius: 6px; font-size: {fs_body_sm}px;
}}

/* ---------------------------------------------- scrollbars (finas) ---- */
QScrollBar:vertical {{ background: transparent; width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{
    background: {pal.border_strong}; border-radius: 3px; min-height: 32px;
}}
QScrollBar::handle:vertical:hover {{ background: {acc_text}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; margin: 2px; }}
QScrollBar::handle:horizontal {{
    background: {pal.border_strong}; border-radius: 3px; min-width: 32px;
}}
QScrollBar::add-page, QScrollBar::sub-page {{ background: transparent; }}

/* ---------------------------------------------------- botões ---------- */
QPushButton {{
    background: {pal.surface2}; color: {pal.text};
    border: 1px solid {pal.border_strong}; border-radius: {r_ctrl}px;
    padding: 7px 16px; font-size: {fs_body}px; font-weight: 600;
}}
QPushButton:hover {{ background: {pal.surface3}; border-color: {acc_text}; }}
QPushButton:pressed {{ background: {pal.border}; }}
QPushButton:focus {{ border: 2px solid {focus}; padding: 6px 15px; }}
QPushButton:disabled {{ color: {pal.text_disabled}; background: {pal.surface1};
    border-color: {pal.border}; }}

QPushButton[variant="primary"] {{
    background: {accent}; color: {on_acc}; border: 1px solid {accent};
    font-weight: 600;
}}
QPushButton[variant="primary"]:hover {{ background: {acc_hover}; border-color: {acc_hover}; }}
QPushButton[variant="primary"]:pressed {{ background: {acc_pressed}; }}
QPushButton[variant="primary"]:focus {{ border: 2px solid {focus}; padding: 6px 15px; }}
QPushButton[variant="primary"]:disabled {{
    background: {pal.border}; color: {pal.text_disabled}; border-color: {pal.border};
}}

QPushButton[variant="subtle"] {{
    background: {pal.surface3}; color: {pal.text}; border: 1px solid {pal.border_strong};
}}
QPushButton[variant="subtle"]:hover {{
    background: {acc_subtle}; color: {acc_text}; border-color: {acc_text};
}}
QPushButton[variant="subtle"]:pressed {{ background: {pal.border}; }}
QPushButton[variant="subtle"]:focus {{ border: 2px solid {focus}; padding: 6px 15px; }}
QPushButton[variant="subtle"]:disabled {{ color: {pal.text_disabled}; }}

QPushButton[variant="danger"] {{
    background: transparent; color: {pal.danger};
    border: 1px solid {pal.danger};
}}
QPushButton[variant="danger"]:hover {{ background: {pal.danger_bg}; }}
QPushButton[variant="danger"]:focus {{ border: 2px solid {focus}; padding: 6px 15px; }}
QPushButton[variant="danger"]:disabled {{ color: {pal.text_disabled}; border-color: {pal.border}; }}

/* compat: propriedades antigas */
QPushButton[accent="true"] {{
    background: {accent}; color: {on_acc}; border: 1px solid {accent}; font-weight: 600;
}}
QPushButton[accent="true"]:hover {{ background: {acc_hover}; }}
QPushButton[danger="true"] {{
    background: transparent; color: {pal.danger}; border: 1px solid {pal.danger};
}}
QPushButton[danger="true"]:hover {{ background: {pal.danger_bg}; }}
QPushButton[flat="true"], QPushButton[success="true"] {{
    background: transparent; color: {pal.text_muted}; border: 1px solid transparent;
}}

/* ---------------------------------------------------- entradas -------- */
QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox {{
    background: {pal.surface1}; color: {pal.text};
    border: 1px solid {pal.border_strong}; border-radius: {r_ctrl}px;
    padding: 7px 12px; font-size: {fs_body}px;
    selection-background-color: {accent}; selection-color: {on_acc};
}}
QLineEdit:disabled, QComboBox:disabled, QSpinBox:disabled {{
    color: {pal.text_disabled}; background: {pal.bg};
}}
QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus, QComboBox:focus {{
    border: 2px solid {focus}; padding: 6px 11px;
}}
QComboBox::drop-down {{ border: none; width: 26px; }}
QComboBox::down-arrow {{
    image: none; border-left: 5px solid transparent;
    border-right: 5px solid transparent; border-top: 6px solid {pal.text_muted};
    margin-right: 8px;
}}
QComboBox QAbstractItemView {{
    background: {pal.surface3}; color: {pal.text};
    border: 1px solid {pal.border_strong}; border-radius: {r_ctrl}px;
    selection-background-color: {acc_subtle}; selection-color: {pal.text};
    padding: 4px; outline: none;
}}
QSpinBox::up-button, QSpinBox::down-button {{
    width: 18px; background: transparent; border: none;
}}
QSpinBox::up-button:hover, QSpinBox::down-button:hover {{ background: {acc_subtle}; }}

/* ---------------------------------------------------- tabelas --------- */
QTableWidget, QTableView, QListWidget, QTreeWidget {{
    background: {pal.surface2}; alternate-background-color: {pal.surface1};
    border: 1px solid {pal.border}; border-radius: {r_ctrl}px;
    gridline-color: {pal.border};
    selection-background-color: {sel_bg}; selection-color: {pal.text};
    outline: none;
}}
QTableWidget::item, QTableView::item {{ padding: 6px 8px; }}
QTableWidget::item:hover, QTableView::item:hover {{ background: {hover_row}; }}
QHeaderView::section {{
    background: {pal.surface1}; color: {pal.text_muted};
    border: none; border-bottom: 1px solid {pal.border};
    border-right: 1px solid {pal.border};
    padding: 8px 10px; font-weight: 600; font-size: {fs_body_sm}px;
}}
QTableWidget QLineEdit {{ background: {pal.bg}; }}

QListWidget::item {{ padding: 7px 10px; border-radius: 6px; }}
QListWidget::item:selected {{ background: {sel_bg}; color: {pal.text}; }}
QListWidget::item:hover {{ background: {hover_row}; }}

/* ---------------------------------------------------- progresso ------- */
QProgressBar {{
    background: {pal.surface1}; border: 1px solid {pal.border};
    border-radius: 4px; text-align: center; color: {pal.text_muted};
    font-size: {fs_caption}px; min-height: 8px; max-height: 8px;
}}
QProgressBar::chunk {{ background: {accent}; border-radius: 3px; }}

/* ---------------------------------------------------- seletores ------- */
QTabWidget::pane {{ border: none; }}
QCheckBox, QRadioButton {{ spacing: 8px; color: {pal.text}; padding: 3px; }}
QCheckBox::indicator, QRadioButton::indicator {{
    width: 17px; height: 17px; border: 1px solid {pal.border_strong};
    border-radius: 4px; background: {pal.surface1};
}}
QRadioButton::indicator {{ border-radius: 9px; }}
QCheckBox::indicator:hover, QRadioButton::indicator:hover {{ border-color: {acc_text}; }}
QCheckBox::indicator:checked, QRadioButton::indicator:checked {{
    background: {accent}; border-color: {accent};
}}
QCheckBox:disabled, QRadioButton:disabled {{ color: {pal.text_disabled}; }}

QSlider {{ min-height: 24px; }}
QSlider::groove:horizontal {{ height: 6px; background: {pal.border_strong}; border-radius: 3px; }}
QSlider::sub-page:horizontal {{ background: {accent}; border-radius: 3px; }}
QSlider::handle:horizontal {{
    background: {pal.text}; width: 16px; height: 16px; margin: -6px 0;
    border-radius: 8px;
}}
QSlider::handle:horizontal:hover {{ background: {accent}; }}

/* ---------------------------------------------------- menus/msgbox ---- */
QMenu {{
    background: {pal.surface3}; border: 1px solid {pal.border_strong};
    border-radius: {r_ctrl}px; padding: 6px;
}}
QMenu::item {{ padding: 8px 24px; border-radius: 6px; }}
QMenu::item:selected {{ background: {acc_subtle}; color: {pal.text}; }}
QMenu::item:disabled {{ color: {pal.text_disabled}; }}
QMenu::separator {{ height: 1px; background: {pal.border}; margin: 4px 8px; }}
QMessageBox {{ background: {pal.surface1}; }}
QMessageBox QLabel {{ color: {pal.text}; background: transparent; }}

QGroupBox {{
    border: 1px solid {pal.border}; border-radius: {r_card}px;
    margin-top: 14px; padding: 12px 8px 8px 8px;
    font-weight: 600; color: {pal.text_muted};
}}
QGroupBox::title {{
    subcontrol-origin: margin; left: 12px; padding: 0 6px; color: {acc_text};
}}

QSplitter::handle {{ background: {pal.border}; }}
QStatusBar {{ background: {pal.surface1}; color: {pal.text_muted}; }}
QFrame[frameShape="6"], QFrame[frameShape="7"] {{ color: {pal.border}; }}
"""


# ------------------------------------------------------------------ set/get


def set_theme(mode: str = "dark", accent_key: Optional[str] = None,
              density: Optional[str] = None, app: Optional[QApplication] = None) -> None:
    """Aplica tema/acento/densidade e notifica todos os widgets (tempo real)."""
    global MODE, ACCENT, _palette, DENSITY
    global BG, SURFACE1, SURFACE2, SURFACE3, PANEL, CARD, CARD_HOVER
    global BORDER, BORDER_SOFT, BORDER_STRONG
    global TEXT, TEXT_MUTED, TEXT_FAINT, TEXT_DISABLED
    global SUCCESS, WARNING, DANGER, INFO, ACCENT_DIM, ACCENT_TEXT, ON_ACCENT

    MODE = "light" if mode == "light" else "dark"
    _palette = LIGHT if MODE == "light" else DARK
    if accent_key in ACCENTS:
        ACCENT = ACCENTS[accent_key]
    if density in ("comfortable", "compact"):
        DENSITY = density

    pal = _palette
    BG = pal.bg
    SURFACE1, SURFACE2, SURFACE3 = pal.surface1, pal.surface2, pal.surface3
    PANEL, CARD, CARD_HOVER = pal.surface1, pal.surface2, pal.surface3
    BORDER, BORDER_SOFT, BORDER_STRONG = pal.border, pal.border, pal.border_strong
    TEXT, TEXT_MUTED, TEXT_FAINT = pal.text, pal.text_muted, pal.text_faint
    TEXT_DISABLED, SUCCESS, WARNING = pal.text_disabled, pal.success, pal.warning
    DANGER, INFO = pal.danger, pal.info
    ACCENT_DIM = _mix(ACCENT, pal.surface2, 0.55)
    ACCENT_TEXT = accent_for_text()
    ON_ACCENT = on_accent()

    qapp = app or QApplication.instance()
    if qapp is not None:
        qapp.setStyleSheet(build_qss(pal, ACCENT))
        palette = QPalette()
        palette.setColor(QPalette.ColorRole.Window, QColor(pal.bg))
        palette.setColor(QPalette.ColorRole.WindowText, QColor(pal.text))
        palette.setColor(QPalette.ColorRole.Base, QColor(pal.surface2))
        palette.setColor(QPalette.ColorRole.AlternateBase, QColor(pal.surface1))
        palette.setColor(QPalette.ColorRole.Text, QColor(pal.text))
        palette.setColor(QPalette.ColorRole.Highlight, QColor(ACCENT))
        palette.setColor(QPalette.ColorRole.HighlightedText, QColor(on_accent()))
        palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(pal.surface3))
        palette.setColor(QPalette.ColorRole.ToolTipText, QColor(pal.text))
        qapp.setPalette(palette)
    manager.emit_change()


def apply_theme(app: QApplication, accent_key: Optional[str] = DEFAULT_ACCENT,
                mode: Optional[str] = None) -> str:
    """Compatibilidade com app.py / dev_ui_check: aplica acento (e tema se dado)."""
    if accent_key in ACCENTS:
        global ACCENT  # noqa: PLW0603
        ACCENT = ACCENTS[accent_key]
    set_theme(mode=mode or MODE, app=app)
    return ACCENT
