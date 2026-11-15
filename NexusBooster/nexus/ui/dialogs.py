"""Diálogos auxiliares: seleção de processos, adicionar jogo e detalhes do jogo."""

from __future__ import annotations

import os
import subprocess
import sys

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QFileDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
)

from nexus.core.worker import run_task
from nexus.games.profiles import get_profile
from nexus.system import processes as sys_processes
from nexus.ui import icons, theme
from nexus.ui.components import Pill, SectionTitle, confirm, toast_for


class ProcessPickerDialog(QDialog):
    """Seleciona processos em execução (para a lista de suspensão)."""

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.selected: list[str] = []
        self.setWindowTitle("Escolher processos em execução")
        self.setMinimumSize(460, 520)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(18, 14, 18, 14)
        lay.setSpacing(10)

        hint = QLabel("Marque os aplicativos que devem ser suspensos durante o boost.")
        hint.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        lay.addWidget(hint)

        from nexus.ui.tabs.processes import _ProcessTable

        self.table = _ProcessTable(services, selectable_check=True)
        lay.addWidget(self.table, 1)

        btns = QHBoxLayout()
        cancel = QPushButton("Cancelar")
        cancel.clicked.connect(self.reject)
        ok = QPushButton("Adicionar selecionados")
        ok.setProperty("accent", True)
        ok.clicked.connect(self._accept)
        btns.addStretch(1)
        btns.addWidget(cancel)
        btns.addWidget(ok)
        lay.addLayout(btns)

        self.table.refresh()

    def _accept(self) -> None:
        self.selected = list(self.table.checked_names())
        if not self.selected:
            toast_for(self, "Selecione pelo menos um processo.", "warning")
            return
        self.accept()


class AddGameDialog(QDialog):
    """Cadastro manual de jogo (nome + executável)."""

    def __init__(self, services, parent=None):
        super().__init__(parent)
        self.services = services
        self.game = None
        self.setWindowTitle("Adicionar jogo manualmente")
        self.setMinimumWidth(480)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(20, 16, 20, 16)
        lay.setSpacing(12)

        title = QLabel("Adicionar jogo à biblioteca")
        title.setStyleSheet(f"color: {theme.TEXT}; font-size: 15px; font-weight: 800;")
        lay.addWidget(title)

        form = QVBoxLayout()
        name_lbl = QLabel("Nome do jogo")
        name_lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("Ex.: EA FC 25")
        form.addWidget(name_lbl)
        form.addWidget(self.name_edit)

        exe_lbl = QLabel("Executável do jogo (.exe)")
        exe_lbl.setStyleSheet(f"color: {theme.TEXT_MUTED}; font-size: 12px;")
        exe_row = QHBoxLayout()
        self.exe_edit = QLineEdit()
        browse = QPushButton("Procurar…")
        browse.clicked.connect(self._browse)
        exe_row.addWidget(self.exe_edit, 1)
        exe_row.addWidget(browse)
        form.addWidget(exe_lbl)
        form.addLayout(exe_row)
        lay.addLayout(form)

        note = QLabel(
            "O Nexus Booster detecta automaticamente o perfil ideal a partir do "
            "nome/executável. Você também pode escolher o perfil depois."
        )
        note.setWordWrap(True)
        note.setStyleSheet(f"color: {theme.TEXT_FAINT}; font-size: 11px;")
        lay.addWidget(note)

        btns = QHBoxLayout()
        btns.addStretch(1)
        cancel = QPushButton("Cancelar")
        cancel.clicked.connect(self.reject)
        add = QPushButton("Adicionar")
        add.setProperty("accent", True)
        add.clicked.connect(self._add)
        btns.addWidget(cancel)
        btns.addWidget(add)
        lay.addLayout(btns)

    def _browse(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Selecionar executável do jogo", "", "Executáveis (*.exe);;Todos os arquivos (*)"
        )
        if path:
            self.exe_edit.setText(path)
            if not self.name_edit.text().strip():
                self.name_edit.setText(os.path.splitext(os.path.basename(path))[0])

    def _add(self) -> None:
        from nexus.core.database import GameRecord
        from nexus.games.profiles import find_profile

        name = self.name_edit.text().strip()
        exe = self.exe_edit.text().strip()
        if not name:
            toast_for(self, "Informe o nome do jogo.", "warning")
            return
        if not exe:
            toast_for(self, "Informe o caminho do executável.", "warning")
            return
        profile = find_profile(name, exe)
        self.game = GameRecord(
            id=None, name=name, platform="manual", exe_path=exe,
            launch_cmd=f'"{exe}"', profile_id=profile.id, manual=True,
        )
        self.accept()


def launch_game(services, game, parent) -> None:
    """Inicia um jogo (com boost opcional) usando o comando real da plataforma."""
    cmd = game.launch_command(game.args or "")
    if not cmd:
        toast_for(parent, "Comando de inicialização desconhecido para este jogo.", "error")
        return

    def job():
        if sys.platform == "win32":
            os.startfile(cmd) if cmd.startswith(("steam://", "com.epicgames.")) else subprocess.Popen(
                cmd, shell=True
            )
        else:
            subprocess.Popen(cmd, shell=True)
        return game.launch_cmd or game.exe_path

    def done(_res) -> None:
        services.db.games_update(game.id, last_played=__import__("time").time())
        toast_for(parent, f"Iniciando {game.name}…", "success")

    def fail(msg) -> None:
        toast_for(parent, f"Falha ao iniciar: {msg}", "error")

    run_task(job, on_done=done, on_error=fail)
