"""Tema visual — painel escuro com azul neon, cartões e interações suaves."""

from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

from nexus.constants import ACCENTS, DEFAULT_ACCENT

# Paleta base ---------------------------------------------------------
BG = "#0a0e17"          # fundo da janela
PANEL = "#0e1420"       # painéis
CARD = "#121926"        # cartões
CARD_HOVER = "#16202f"
BORDER = "#1d2839"
BORDER_SOFT = "#182230"
TEXT = "#e6edf7"
TEXT_MUTED = "#8b98ad"
TEXT_FAINT = "#5c6a80"
ACCENT = ACCENTS[DEFAULT_ACCENT]
ACCENT_DIM = "#0e7490"
SUCCESS = "#2dd4a7"
WARNING = "#fbbf24"
DANGER = "#f87171"

QSS_TEMPLATE = """
* {{
    font-family: "Segoe UI", "Inter", "Ubuntu", "Noto Sans", sans-serif;
    outline: none;
}}
QMainWindow, QDialog {{ background: {BG}; }}
QWidget {{ color: {TEXT}; font-size: 13px; }}
QToolTip {{
    background: {CARD}; color: {TEXT}; border: 1px solid {BORDER};
    padding: 6px 8px; border-radius: 4px;
}}

/* ---------- scrollbars ---------- */
QScrollBar:vertical {{
    background: transparent; width: 10px; margin: 2px;
}}
QScrollBar::handle:vertical {{
    background: {BORDER}; border-radius: 5px; min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{ background: {ACCENT_DIM}; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; margin: 2px; }}
QScrollBar::handle:horizontal {{ background: {BORDER}; border-radius: 5px; min-width: 30px; }}

/* ---------- botões ---------- */
QPushButton {{
    background: {CARD}; color: {TEXT};
    border: 1px solid {BORDER}; border-radius: 8px;
    padding: 8px 16px; font-weight: 600;
}}
QPushButton:hover {{ background: {CARD_HOVER}; border-color: {ACCENT_DIM}; }}
QPushButton:pressed {{ background: {BORDER}; }}
QPushButton:disabled {{ color: {TEXT_FAINT}; background: {PANEL}; }}
QPushButton[accent="true"] {{
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
        stop:0 {ACCENT}, stop:1 #0284c7);
    color: #04121f; border: none; font-weight: 700;
}}
QPushButton[accent="true"]:hover {{
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
        stop:0 #33ddff, stop:1 {ACCENT});
}}
QPushButton[accent="true"]:disabled {{ background: {BORDER}; color: {TEXT_FAINT}; }}
QPushButton[danger="true"] {{
    background: transparent; color: {DANGER}; border: 1px solid #7f2d2d;
}}
QPushButton[danger="true"]:hover {{ background: #2a1414; }}
QPushButton[success="true"] {{
    background: transparent; color: {SUCCESS}; border: 1px solid #14532d;
}}
QPushButton[success="true"]:hover {{ background: #0f2b22; }}
QPushButton[flat="true"] {{
    background: transparent; border: none; color: {TEXT_MUTED};
    padding: 6px 10px; font-weight: 500;
}}
QPushButton[flat="true"]:hover {{ color: {ACCENT}; }}

/* ---------- inputs ---------- */
QLineEdit, QSpinBox, QDoubleSpinBox, QComboBox {{
    background: {PANEL}; color: {TEXT};
    border: 1px solid {BORDER}; border-radius: 8px;
    padding: 8px 12px; selection-background-color: {ACCENT};
}}
QLineEdit:focus, QSpinBox:focus, QComboBox:focus {{ border-color: {ACCENT}; }}
QComboBox::drop-down {{ border: none; width: 26px; }}
QComboBox::down-arrow {{
    image: none; border-left: 5px solid transparent;
    border-right: 5px solid transparent; border-top: 6px solid {TEXT_MUTED};
    margin-right: 8px;
}}
QComboBox QAbstractItemView {{
    background: {CARD}; color: {TEXT};
    border: 1px solid {BORDER}; border-radius: 8px;
    selection-background-color: {ACCENT_DIM}; selection-color: {TEXT};
    padding: 4px;
}}
QSpinBox::up-button, QSpinBox::down-button {{ width: 18px; background: {CARD}; }}
QSpinBox::up-button:hover, QSpinBox::down-button:hover {{ background: {CARD_HOVER}; }}

/* ---------- tabelas ---------- */
QTableWidget, QTableView {{
    background: {CARD}; alternate-background-color: #141c2b;
    border: 1px solid {BORDER}; border-radius: 10px;
    gridline-color: {BORDER_SOFT}; selection-background-color: #10344a;
    selection-color: {TEXT};
}}
QHeaderView::section {{
    background: {PANEL}; color: {TEXT_MUTED};
    border: none; border-bottom: 1px solid {BORDER};
    padding: 8px 10px; font-weight: 600; font-size: 12px;
}}
QTableWidget::item {{ padding: 6px 8px; }}
QTableWidget::item:hover {{ background: #14202f; }}
QTableWidget::item:selected {{ background: #10344a; }}

/* ---------- barras de progresso ---------- */
QProgressBar {{
    background: {PANEL}; border: 1px solid {BORDER};
    border-radius: 7px; text-align: center; color: {TEXT}; height: 14px;
    font-size: 11px;
}}
QProgressBar::chunk {{
    background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
        stop:0 {ACCENT}, stop:1 #0284c7);
    border-radius: 6px;
}}

/* ---------- tabs/checkbox/radio ---------- */
QTabWidget::pane {{ border: none; }}
QCheckBox, QRadioButton {{
    spacing: 8px; color: {TEXT}; padding: 2px;
}}
QCheckBox::indicator, QRadioButton::indicator {{
    width: 17px; height: 17px; border: 1px solid {BORDER}; border-radius: 5px;
    background: {PANEL};
}}
QRadioButton::indicator {{ border-radius: 9px; }}
QCheckBox::indicator:hover, QRadioButton::indicator:hover {{ border-color: {ACCENT}; }}
QCheckBox::indicator:checked, QRadioButton::indicator:checked {{
    background: {ACCENT}; border-color: {ACCENT};
}}

/* ---------- menu ---------- */
QMenu {{
    background: {CARD}; border: 1px solid {BORDER}; border-radius: 10px; padding: 6px;
}}
QMenu::item {{ padding: 8px 24px; border-radius: 6px; }}
QMenu::item:selected {{ background: {ACCENT_DIM}; }}
QMenu::separator {{ height: 1px; background: {BORDER}; margin: 4px 8px; }}

/* ---------- messagebox ---------- */
QMessageBox {{ background: {PANEL}; }}
QMessageBox QLabel {{ color: {TEXT}; }}

/* ---------- sliders ---------- */
QSlider::groove:horizontal {{
    height: 5px; background: {BORDER}; border-radius: 2px;
}}
QSlider::sub-page:horizontal {{ background: {ACCENT}; border-radius: 2px; }}
QSlider::handle:horizontal {{
    background: {TEXT}; width: 14px; height: 14px;
    margin: -5px 0; border-radius: 7px;
}}
QSlider::handle:horizontal:hover {{ background: {ACCENT}; }}

/* ---------- grupos ---------- */
QGroupBox {{
    border: 1px solid {BORDER}; border-radius: 10px;
    margin-top: 14px; padding: 12px 8px 8px 8px;
    font-weight: 600; color: {TEXT_MUTED};
}}
QGroupBox::title {{
    subcontrol-origin: margin; left: 12px; padding: 0 6px; color: {ACCENT};
}}
"""


def get_qss(accent: str = ACCENT) -> str:
    return QSS_TEMPLATE.format(
        BG=BG, PANEL=PANEL, CARD=CARD, CARD_HOVER=CARD_HOVER,
        BORDER=BORDER, BORDER_SOFT=BORDER_SOFT, TEXT=TEXT,
        TEXT_MUTED=TEXT_MUTED, TEXT_FAINT=TEXT_FAINT, ACCENT=accent,
        ACCENT_DIM=ACCENT_DIM, SUCCESS=SUCCESS, WARNING=WARNING, DANGER=DANGER,
    )


def apply_theme(app: QApplication, accent_key: str = DEFAULT_ACCENT) -> str:
    global ACCENT
    accent = ACCENTS.get(accent_key, ACCENT)
    ACCENT = accent
    app.setStyleSheet(get_qss(accent))

    palette = QPalette()
    palette.setColor(QPalette.Window, QColor(BG))
    palette.setColor(QPalette.WindowText, QColor(TEXT))
    palette.setColor(QPalette.Base, QColor(CARD))
    palette.setColor(QPalette.Text, QColor(TEXT))
    palette.setColor(QPalette.Highlight, QColor(accent))
    palette.setColor(QPalette.HighlightedText, QColor("#04121f"))
    app.setPalette(palette)
    return accent
