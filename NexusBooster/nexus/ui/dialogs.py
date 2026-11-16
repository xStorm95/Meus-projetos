"""Diálogos auxiliares: lançar jogo, adicionar manual, escolher processo."""

from __future__ import annotations

from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLineEdit,
    QVBoxLayout,
)

from nexus.core.database import GameRecord
from nexus.ui import theme
from nexus.ui.components import Button, SearchBox, ThemeLabel, toast_for
from nexus.ui.tabs.processes import _ProcessTable


class AddGameDialog(QDialog):
    """Adiciona um jogo manualmente (nome, plataforma, caminho do exe)."""

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.game = None
        self.setWindowTitle("Adicionar jogo manualmente")
        self.setMinimumWidth(480)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("lg"), theme.pad("md"), theme.pad("lg"),
                               theme.pad("md"))
        lay.setSpacing(theme.pad("sm"))

        lay.addWidget(ThemeLabel("Nome do jogo:", "label"))
        self.name = QLineEdit()
        self.name.setPlaceholderText("Ex.: FiveM")
        lay.addWidget(self.name)

        lay.addWidget(ThemeLabel("Plataforma:", "label"))
        self.platform = QComboBox()
        for pid, label in (
            ("steam", "Steam"), ("epic", "Epic Games"), ("riot", "Riot Games"),
            ("battlenet", "Battle.net"), ("manual", "Executável manual (qualquer)"),
        ):
            self.platform.addItem(label, pid)
        lay.addWidget(self.platform)

        lay.addWidget(ThemeLabel("Executável do jogo:", "label"))
        row = QHBoxLayout()
        self.exe = QLineEdit()
        self.exe.setPlaceholderText(r"C:\Jogos\MeuJogo\jogo.exe")
        browse = Button("Procurar…", "secondary", "folder")
        browse.clicked.connect(self._browse)
        row.addWidget(self.exe, 1)
        row.addWidget(browse)
        lay.addLayout(row)

        hint = ThemeLabel(
            "O DK usa o executável para lançar o jogo e identificar o "
            "processo durante as sessões de boost.", "caption", wrap=True,
        )
        lay.addWidget(hint)
        lay.addStretch(1)

        btns = QHBoxLayout()
        btns.addStretch(1)
        cancel = Button("Cancelar")
        cancel.clicked.connect(self.reject)
        save = Button("Adicionar jogo", "primary", "plus")
        save.clicked.connect(self._save)
        btns.addWidget(cancel)
        btns.addWidget(save)
        lay.addLayout(btns)

    def _browse(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Selecionar executável do jogo",
                                              "", "Executáveis (*.exe)")
        if path:
            self.exe.setText(path)

    def _save(self) -> None:
        name = self.name.text().strip()
        exe = self.exe.text().strip()
        if not name or not exe:
            toast_for(self, "Informe o nome e o executável do jogo.", "warning")
            return
        self.game = GameRecord(
            id=None,
            name=name,
            platform=self.platform.currentData(),
            exe_path=exe,
            launch_cmd=f'"{exe}"',
            profile_id="generic",
        )
        self.accept()


class ProcessPickerDialog(QDialog):
    """Seleciona processos em execução (para a lista de suspensão)."""

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.selected: list[str] = []
        self.setWindowTitle("Escolher processos em execução")
        self.setMinimumSize(640, 480)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(theme.pad("lg"), theme.pad("md"), theme.pad("lg"),
                               theme.pad("md"))
        lay.setSpacing(theme.pad("sm"))

        lay.addWidget(ThemeLabel(
            "Marque os aplicativos que devem ser suspensos durante os jogos. "
            "Processos protegidos do Windows não são listados.", "body_sm", wrap=True
        ))
        self.search = SearchBox("Filtrar…")
        self.search.textChanged.connect(self._filter)
        lay.addWidget(self.search)

        self.table = _ProcessTable(services, selectable_check=True)
        lay.addWidget(self.table, 1)

        btns = QHBoxLayout()
        btns.addStretch(1)
        cancel = Button("Cancelar")
        cancel.clicked.connect(self.reject)
        ok = Button("Adicionar selecionados", "primary", "check")
        ok.clicked.connect(self._ok)
        btns.addWidget(cancel)
        btns.addWidget(ok)
        lay.addLayout(btns)

        self.table.refresh()

    def _filter(self, text: str) -> None:
        text = text.lower()
        for row in range(self.table.rowCount()):
            row_text = " ".join(
                (self.table.item(row, c).text() if self.table.item(row, c) else "")
                for c in range(1, 7)
            ).lower()
            self.table.setRowHidden(row, bool(text) and text not in row_text)

    def _ok(self) -> None:
        self.selected = self.table.checked_names()
        if not self.selected:
            toast_for(self, "Selecione pelo menos um processo.", "warning")
            return
        self.accept()


def launch_game(services, game, parent=None) -> None:
    """Lança o jogo pelo comando registrado (com aviso em caso de falha)."""
    import os
    import subprocess

    cmd = game.launch_cmd or (f'"{game.exe_path}"' if game.exe_path else None)
    if not cmd:
        toast_for(parent, "Este jogo não possui comando de inicialização registrado.",
                  "warning")
        return
    try:
        subprocess.Popen(cmd, shell=True,
                         cwd=os.path.dirname(game.exe_path) if game.exe_path else None)
        services.db.history_add(
            "session", f"Jogo iniciado: {game.name}",
            description=f"Comando: {cmd[:200]}",
        )
        toast_for(parent, f"Iniciando {game.name}…", "success")
    except Exception as exc:  # noqa: BLE001
        toast_for(parent, f"Falha ao iniciar: {exc}", "error")
