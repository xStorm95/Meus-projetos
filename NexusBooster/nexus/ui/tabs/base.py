"""Classe base das abas: área rolável com layout vertical padrão."""

from __future__ import annotations

from PySide6.QtWidgets import QFrame, QScrollArea, QVBoxLayout, QWidget


class BaseTab(QScrollArea):
    def __init__(self, services, main_window=None):
        super().__init__()
        self.services = services
        self.main = main_window
        self.setWidgetResizable(True)
        self.setFrameShape(QFrame.Shape.NoFrame)
        self.setStyleSheet("QScrollArea { background: transparent; border: none; }")

        self._content = QWidget()
        self._content.setStyleSheet("background: transparent;")
        self.setWidget(self._content)

        self.vbox = QVBoxLayout(self._content)
        self.vbox.setContentsMargins(24, 20, 24, 24)
        self.vbox.setSpacing(16)
        self.vbox.addStretch(1)

    def add(self, widget: QWidget, stretch: int = 0) -> QWidget:
        """Adiciona widget antes do espaçador final."""
        self.vbox.insertWidget(self.vbox.count() - 1, widget, stretch)
        return widget

    def add_layout(self, layout, stretch: int = 0) -> None:
        self.vbox.insertLayout(self.vbox.count() - 1, layout, stretch)

    def add_stretch(self) -> None:
        self.vbox.insertStretch(self.vbox.count() - 1)
