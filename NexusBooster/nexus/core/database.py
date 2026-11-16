"""Camada de persistência SQLite: histórico, configurações, jogos, erros e sessões."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional


@dataclass
class HistoryEntry:
    id: int
    ts: float
    category: str
    action: str
    description: str
    details: str
    undo: Optional[dict]
    undone: bool
    undone_at: Optional[float]


@dataclass
class GameRecord:
    id: Optional[int]
    name: str
    platform: str
    exe_path: str
    launch_cmd: str
    args: str = ""
    favorite: bool = False
    manual: bool = False
    profile_id: str = "generic"
    last_played: Optional[float] = None


@dataclass
class ErrorEntry:
    id: int
    ts: float
    module: str
    message: str
    traceback: str
    level: str = "ERROR"


@dataclass
class BenchEntry:
    id: int
    ts: float
    game_name: str
    avg_fps: float
    low_fps: float
    note: str = ""


class Database:
    """Acesso thread-safe ao SQLite (WAL)."""

    def __init__(self, path: Path):
        self._path = str(path)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        self._create_tables()

    # ------------------------------------------------------------- infra
    def _create_tables(self) -> None:
        with self._lock:
            c = self._conn
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    category TEXT NOT NULL,
                    action TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    details TEXT NOT NULL DEFAULT '',
                    undo_json TEXT,
                    undone INTEGER NOT NULL DEFAULT 0,
                    undone_at REAL
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS games (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    exe_path TEXT NOT NULL DEFAULT '',
                    launch_cmd TEXT NOT NULL DEFAULT '',
                    args TEXT NOT NULL DEFAULT '',
                    favorite INTEGER NOT NULL DEFAULT 0,
                    manual INTEGER NOT NULL DEFAULT 0,
                    profile_id TEXT NOT NULL DEFAULT 'generic',
                    last_played REAL,
                    UNIQUE(name, platform)
                );
                CREATE TABLE IF NOT EXISTS game_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER,
                    game_name TEXT NOT NULL,
                    started_at REAL NOT NULL,
                    ended_at REAL,
                    summary_json TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS error_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    module TEXT NOT NULL,
                    message TEXT NOT NULL,
                    traceback TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS benchmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts REAL NOT NULL,
                    game_name TEXT NOT NULL,
                    avg_fps REAL NOT NULL,
                    low_fps REAL NOT NULL,
                    note TEXT NOT NULL DEFAULT ''
                );
                """
            )
            c.commit()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._lock:
            self._conn.execute(sql, params)
            self._conn.commit()

    def query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self._conn.execute(sql, params).fetchall())

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # --------------------------------------------------------- histórico
    def history_add(
        self,
        category: str,
        action: str,
        description: str = "",
        details: str = "",
        undo: Optional[dict] = None,
    ) -> int:
        cur = None
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO history (ts, category, action, description, details, undo_json)"
                " VALUES (?,?,?,?,?,?)",
                (
                    time.time(),
                    category,
                    action,
                    description,
                    details,
                    json.dumps(undo, ensure_ascii=False) if undo else None,
                ),
            )
            self._conn.commit()
        return int(cur.lastrowid)

    def history_list(self, limit: int = 300, category: Optional[str] = None) -> list[HistoryEntry]:
        if category:
            rows = self.query(
                "SELECT * FROM history WHERE category=? ORDER BY id DESC LIMIT ?",
                (category, limit),
            )
        else:
            rows = self.query("SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,))
        return [self._history_row(r) for r in rows]

    def history_entry(self, entry_id: int) -> Optional[HistoryEntry]:
        rows = self.query("SELECT * FROM history WHERE id=?", (entry_id,))
        return self._history_row(rows[0]) if rows else None

    def history_mark_undone(self, entry_id: int) -> None:
        self.execute(
            "UPDATE history SET undone=1, undone_at=? WHERE id=?",
            (time.time(), entry_id),
        )

    def history_undoable(self, limit: int = 500) -> list[HistoryEntry]:
        rows = self.query(
            "SELECT * FROM history WHERE undo_json IS NOT NULL AND undone=0"
            " ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [self._history_row(r) for r in rows]

    def last_optimization(self) -> Optional[HistoryEntry]:
        rows = self.query(
            "SELECT * FROM history WHERE category!='session' ORDER BY id DESC LIMIT 1"
        )
        return self._history_row(rows[0]) if rows else None

    @staticmethod
    def _history_row(r: sqlite3.Row) -> HistoryEntry:
        return HistoryEntry(
            id=r["id"],
            ts=r["ts"],
            category=r["category"],
            action=r["action"],
            description=r["description"],
            details=r["details"],
            undo=json.loads(r["undo_json"]) if r["undo_json"] else None,
            undone=bool(r["undone"]),
            undone_at=r["undone_at"],
        )

    # ------------------------------------------------------- configurações
    def settings_get(self, key: str, default: Any = None) -> Any:
        rows = self.query("SELECT value FROM settings WHERE key=?", (key,))
        if not rows:
            return default
        return json.loads(rows[0]["value"])

    def settings_set(self, key: str, value: Any) -> None:
        self.execute(
            "INSERT INTO settings (key, value) VALUES (?,?)"
            " ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )

    # --------------------------------------------------------------- jogos
    def games_all(self) -> list[GameRecord]:
        rows = self.query("SELECT * FROM games ORDER BY favorite DESC, name COLLATE NOCASE")
        return [self._game_row(r) for r in rows]

    def games_get(self, game_id: int) -> Optional[GameRecord]:
        rows = self.query("SELECT * FROM games WHERE id=?", (game_id,))
        return self._game_row(rows[0]) if rows else None

    def games_upsert(self, g: GameRecord) -> int:
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT INTO games (name, platform, exe_path, launch_cmd, args, favorite,
                                    manual, profile_id, last_played)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(name, platform) DO UPDATE SET
                    exe_path=excluded.exe_path,
                    launch_cmd=excluded.launch_cmd
                """,
                (
                    g.name, g.platform, g.exe_path, g.launch_cmd, g.args,
                    int(g.favorite), int(g.manual), g.profile_id, g.last_played,
                ),
            )
            self._conn.commit()
        return int(cur.lastrowid)

    def games_update(self, game_id: int, **fields: Any) -> None:
        if not fields:
            return
        cols = ", ".join(f"{k}=?" for k in fields)
        self.execute(
            f"UPDATE games SET {cols} WHERE id=?", (*fields.values(), game_id)
        )

    def games_delete(self, game_id: int) -> None:
        self.execute("DELETE FROM games WHERE id=?", (game_id,))

    @staticmethod
    def _game_row(r: sqlite3.Row) -> GameRecord:
        return GameRecord(
            id=r["id"],
            name=r["name"],
            platform=r["platform"],
            exe_path=r["exe_path"],
            launch_cmd=r["launch_cmd"],
            args=r["args"],
            favorite=bool(r["favorite"]),
            manual=bool(r["manual"]),
            profile_id=r["profile_id"],
            last_played=r["last_played"],
        )

    # ------------------------------------------------------------- sessões
    def session_start(self, game_id: Optional[int], game_name: str, summary: dict) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO game_sessions (game_id, game_name, started_at, summary_json)"
                " VALUES (?,?,?,?)",
                (game_id, game_name, time.time(), json.dumps(summary, ensure_ascii=False)),
            )
            self._conn.commit()
        return int(cur.lastrowid)

    def session_end(self, session_id: int, summary: dict) -> None:
        self.execute(
            "UPDATE game_sessions SET ended_at=?, summary_json=? WHERE id=?",
            (time.time(), json.dumps(summary, ensure_ascii=False), session_id),
        )

    # --------------------------------------------------------------- erros
    def error_add(self, module: str, message: str, tb: str = "",
                  level: str = "ERROR") -> None:
        try:
            self.execute(
                "INSERT INTO error_log (ts, module, message, traceback, level)"
                " VALUES (?,?,?,?,?)",
                (time.time(), module, message, tb, level),
            )
        except Exception:
            # coluna 'level' pode não existir em bancos antigos → migração única
            try:
                self.execute("ALTER TABLE error_log ADD COLUMN level TEXT DEFAULT 'ERROR'")
                self.execute(
                    "INSERT INTO error_log (ts, module, message, traceback, level)"
                    " VALUES (?,?,?,?,?)",
                    (time.time(), module, message, tb, level),
                )
            except Exception:
                import logging

                logging.getLogger("nexus.db").warning(
                    "falha ao gravar error_log: %s / %s", module, message[:120]
                )

    def errors_list(self, limit: int = 100, level: str = "") -> list[ErrorEntry]:
        if level:
            rows = self.query(
                "SELECT * FROM error_log WHERE level=? ORDER BY id DESC LIMIT ?",
                (level, limit),
            )
        else:
            rows = self.query(
                "SELECT * FROM error_log ORDER BY id DESC LIMIT ?", (limit,)
            )
        out = []
        for r in rows:
            out.append(ErrorEntry(
                r["id"], r["ts"], r["module"], r["message"], r["traceback"],
                r["level"] if "level" in r.keys() else "ERROR",
            ))
        return out

    def errors_clear(self) -> None:
        self.execute("DELETE FROM error_log")

    # ---------------------------------------------------------- benchmarks
    def bench_add(self, game_name: str, avg_fps: float, low_fps: float, note: str = "") -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO benchmarks (ts, game_name, avg_fps, low_fps, note)"
                " VALUES (?,?,?,?,?)",
                (time.time(), game_name, avg_fps, low_fps, note),
            )
            self._conn.commit()
        return int(cur.lastrowid)

    def bench_list(self, limit: int = 30) -> list[BenchEntry]:
        rows = self.query(
            "SELECT * FROM benchmarks ORDER BY id DESC LIMIT ?", (limit,)
        )
        return [
            BenchEntry(r["id"], r["ts"], r["game_name"], r["avg_fps"], r["low_fps"], r["note"])
            for r in rows
        ]
