"""Garante uma única instância do aplicativo (QLocalServer/Socket)."""

from __future__ import annotations

from PySide6.QtNetwork import QLocalServer, QLocalSocket

APP_KEY = "NexusBoosterSingleInstance"


def is_already_running() -> bool:
    sock = QLocalSocket()
    sock.connectToServer(APP_KEY)
    running = sock.waitForConnected(200)
    if running:
        sock.disconnectFromServer()
    return running


def listen() -> QLocalServer | None:
    QLocalServer.removeServer(APP_KEY)
    server = QLocalServer()
    if server.listen(APP_KEY):
        return server
    return None
