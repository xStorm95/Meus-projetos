#!/usr/bin/env python3
"""Testes de lógica (sem GUI). Executar:  python tests/test_core.py"""

from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from nexus.core import safety
from nexus.core.database import Database, GameRecord
from nexus.core.settings import Settings
from nexus.games.profiles import find_profile, get_profile, COMMON_SUSPEND
from nexus.games.scanner import parse_vdf
from nexus.network import diagnostics
from nexus.optimization import cleaner
from nexus.optimization.engine import OptimizationEngine
from nexus.optimization.power import PowerPlan, list_plans  # noqa: F401


class TestSafety(unittest.TestCase):
    def test_protected_process(self):
        self.assertTrue(safety.is_protected_process("csrss.exe"))
        self.assertTrue(safety.is_protected_process("System"))
        self.assertFalse(safety.is_protected_process("Discord.exe"))

    def test_protected_service(self):
        self.assertTrue(safety.is_protected_service("WinDefend"))
        self.assertTrue(safety.is_protected_service("wuauserv"))
        self.assertFalse(safety.is_protected_service("Fax"))

    def test_validate_delete_path(self):
        with tempfile.TemporaryDirectory() as root:
            root_p = Path(root)
            allowed = [root_p]
            ok_file = root_p / "sub" / "junk.tmp"
            ok_file.parent.mkdir()
            ok_file.write_text("x")
            resolved = safety.validate_delete_path(ok_file, allowed)
            self.assertEqual(resolved, ok_file.resolve())
            with self.assertRaises(safety.SafetyError):
                safety.validate_delete_path(Path("/etc/passwd"), allowed)

    def test_protected_extensions(self):
        self.assertTrue(safety.has_protected_extension(Path("doc.pdf")))
        self.assertFalse(safety.has_protected_extension(Path("junk.tmp")))


class TestCleaner(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.environ["TEMP"] = self.tmp  # redireciona a categoria temp_user
        # arquivo antigo (deletável)
        self.old = Path(self.tmp) / "old_cache.bin"
        self.old.write_bytes(b"x" * 1000)
        past = time.time() - 3600
        os.utime(self.old, (past, past))
        # arquivo recente (deve ser preservado — regra de 10 min)
        self.recent = Path(self.tmp) / "recent.tmp"
        self.recent.write_bytes(b"y" * 500)
        # documento (nunca apagar)
        self.doc = Path(self.tmp) / "curriculo.pdf"
        self.doc.write_bytes(b"z" * 200)
        past = time.time() - 7200
        os.utime(self.doc, (past, past))

    def test_analyze_and_clean(self):
        results = cleaner.analyze(["temp_user"])
        self.assertIn("temp_user", results)
        res = results["temp_user"]
        self.assertGreaterEqual(res.bytes, 1000)
        # análise não remove nada
        self.assertTrue(self.old.exists())

        report = cleaner.clean(["temp_user"])
        self.assertTrue(self.old.exists() is False)
        self.assertTrue(self.recent.exists(), "arquivo recente deve ser preservado")
        self.assertTrue(self.doc.exists(), "documento deve ser preservado")
        self.assertGreaterEqual(report.freed_bytes, 1000)

    def test_format_size(self):
        self.assertIn("KB", cleaner.format_size(2048))
        self.assertIn("GB", cleaner.format_size(3 * 1024**3))


class TestProfiles(unittest.TestCase):
    def test_find_by_name(self):
        self.assertEqual(find_profile("VALORANT").id, "valorant")
        self.assertEqual(find_profile("Counter-Strike 2").id, "cs2")
        self.assertEqual(find_profile("GTA V").id, "gtav")
        self.assertEqual(find_profile("Jogo Aleatório").id, "generic")

    def test_find_by_exe(self):
        self.assertEqual(find_profile("Jogo", r"C:\Riot Games\VALORANT\x.exe").id, "valorant")
        self.assertEqual(find_profile("Jogo", r"C:\Steam\steamapps\common\r5apex.exe").id, "apex")

    def test_builtin_complete(self):
        ids = {p.id for p in __import__("nexus.games.profiles", fromlist=["BUILTIN_PROFILES"]).BUILTIN_PROFILES}
        expected = {"valorant", "lol", "cs2", "fortnite", "gtav", "fivem", "roblox",
                    "minecraft", "cod", "apex", "pubg", "r6", "generic"}
        self.assertTrue(expected.issubset(ids))


class TestVdfParser(unittest.TestCase):
    def test_steam_libraryfolders(self):
        text = '''
        "libraryfolders"
        {
            "0"
            {
                "path"        "C:\\\\Program Files (x86)\\\\Steam"
                "label"       ""
            }
            "1"
            {
                "path"        "D:\\\\SteamLibrary"
            }
        }
        '''
        data = parse_vdf(text)
        folders = data.get("libraryfolders", {})
        paths = [v.get("path") for v in folders.values() if isinstance(v, dict)]
        self.assertIn(r"D:\SteamLibrary", paths)

    def test_appmanifest(self):
        text = '"AppState"\n{\n  "appid"  "730"\n  "name"  "Counter-Strike 2"\n  "installdir"  "Counter-Strike Global Offensive"\n}'
        data = parse_vdf(text)
        state = data["AppState"]
        self.assertEqual(state["name"], "Counter-Strike 2")
        self.assertEqual(state["appid"], "730")


class TestPingParser(unittest.TestCase):
    def test_parse_ptbr(self):
        sample = (
            "Disparando 8.8.8.8 [8.8.8.8] com 32 bytes de dados:\n"
            "Resposta de 8.8.8.8: bytes=32 tempo=24ms TTL=117\n"
            "Resposta de 8.8.8.8: bytes=32 tempo=26ms TTL=117\n"
            "Resposta de 8.8.8.8: bytes=32 tempo=23ms TTL=117\n"
            "Resposta de 8.8.8.8: bytes=32 tempo=25ms TTL=117\n\n"
            "Estatísticas do Ping para 8.8.8.8:\n"
            "    Pacotes: Enviados = 4, Recebidos = 4, Perdidos = 0 (0% de perda)\n"
        )
        # usa o parser real com monkeypatch do subprocess
        from unittest import mock

        fake = mock.Mock()
        fake.stdout = sample
        fake.returncode = 0
        with mock.patch("subprocess.run", return_value=fake):
            result = diagnostics.ping_icmp("8.8.8.8", count=4)
        self.assertEqual(result.loss, 0.0)
        self.assertEqual(len(result.samples), 4)
        self.assertAlmostEqual(result.avg, 24.5, delta=1.5)


class TestDatabase(unittest.TestCase):
    def test_history_roundtrip(self):
        db = Database(":memory:")
        db.execute("DELETE FROM history")
        entry_id = db.history_add(
            "power", "Plano alterado", description="teste",
            undo={"previous_guid": "abc"},
        )
        entries = db.history_undoable()
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].undo["previous_guid"], "abc")
        db.history_mark_undone(entry_id)
        self.assertEqual(db.history_undoable(), [])
        self.assertEqual(db.last_optimization().action, "Plano alterado")

    def test_games_upsert(self):
        db = Database(":memory:")
        g = GameRecord(id=None, name="Teste", platform="steam", exe_path="x", launch_cmd="y")
        gid = db.games_upsert(g)
        games = db.games_all()
        self.assertEqual(len(games), 1)
        db.games_update(gid, favorite=True)
        self.assertTrue(db.games_get(gid).favorite)

    def test_settings(self):
        db = Database(":memory:")
        s = Settings(db)
        self.assertEqual(s.get_int("monitor_interval"), 1000)
        s.set("monitor_interval", 500)
        self.assertEqual(s.get_int("monitor_interval"), 500)
        self.assertTrue(isinstance(s.get_list("suspend_list"), list))

    def test_bench(self):
        db = Database(":memory:")
        db.bench_add("Jogo", 144.2, 98.0, "teste")
        benches = db.bench_list()
        self.assertEqual(len(benches), 1)
        self.assertAlmostEqual(benches[0].avg_fps, 144.2)


class TestEngine(unittest.TestCase):
    def test_resume_empty(self):
        db = Database(":memory:")
        engine = OptimizationEngine(db)
        n = engine.resume_processes([])
        self.assertEqual(n, 0)

    def test_undo_unsupported_category(self):
        db = Database(":memory:")
        db.history_add("mystery", "Ação", undo={"x": 1})
        engine = OptimizationEngine(db)
        entry = db.history_undoable()[0]
        ok, _msg = engine.undo_entry(entry)
        self.assertFalse(ok)


class TestStartupHelpers(unittest.TestCase):
    def test_exe_from_command(self):
        from nexus.optimization import startup as st

        self.assertEqual(
            st._exe_from_command('"C:\\Program Files\\App\\app.exe" --minimized'),
            r"C:\Program Files\App\app.exe",
        )
        self.assertEqual(st._exe_from_command("C:\\app.exe"), r"C:\app.exe")


if __name__ == "__main__":
    unittest.main(verbosity=2)
