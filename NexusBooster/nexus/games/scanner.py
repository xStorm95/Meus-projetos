"""Detecção automática de jogos: Steam, Epic, Riot, Battle.net e Menu Iniciar.

Estratégia real (sem inventar jogos):
- Steam: libraryfolders.vdf + appmanifest_*.acf;
- Epic: arquivos .item de manifesto em ProgramData;
- Riot: pastas conhecidas (VALORANT, League of Legends);
- Battle.net / EA / Ubisoft / GOG / Xbox: atalhos do Menu Iniciar resolvidos
  via PowerShell (WScript.Shell);
- Jogos manuais adicionados pelo usuário.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Callable, Optional

from nexus.games.models import Game
from nexus.games.profiles import find_profile
from nexus.system import powershell as ps
from nexus.system import registry_utils as reg

log = logging.getLogger("nexus.scanner")

_PROGRESS: Callable[[str], None] = lambda msg: None


# ------------------------------------------------------------------ vdf
def parse_vdf(text: str) -> dict:
    """Parser simples de Valve Data Format (dicionários aninhados)."""
    tokens = re.findall(r'"((?:[^"\\]|\\.)*)"|([{}])', text)
    root: dict = {}
    stack = [root]
    pending_key: Optional[str] = None
    for quoted, brace in tokens:
        if brace == "{":
            if pending_key is None:
                pending_key = f"__{len(stack)}"
            new: dict = {}
            stack[-1][pending_key] = new
            stack.append(new)
            pending_key = None
        elif brace == "}":
            if len(stack) > 1:
                stack.pop()
        elif quoted:
            token = quoted.replace('\\"', '"').replace("\\\\", "\\")
            if pending_key is None:
                pending_key = token
            else:
                stack[-1][pending_key] = token
                pending_key = None
    return root


def _steam_path() -> Optional[Path]:
    try:
        v = reg.read(
            "HKCU", r"Software\Valve\Steam", "SteamPath"
        )
        if v:
            p = Path(v)
            if p.is_dir():
                return p
    except reg.UnsupportedPlatform:
        pass
    for cand in (
        Path(r"C:\Program Files (x86)\Steam"),
        Path(r"C:\Program Files\Steam"),
    ):
        if cand.is_dir():
            return cand
    return None


def scan_steam() -> list[Game]:
    games: list[Game] = []
    steam = _steam_path()
    if not steam:
        return games
    _PROGRESS("Procurando bibliotecas Steam...")
    vdf = steam / "config" / "libraryfolders.vdf"
    if not vdf.is_file():
        return games
    try:
        data = parse_vdf(vdf.read_text(encoding="utf-8", errors="replace"))
    except OSError:
        return games
    folders = data.get("libraryfolders", {})
    libs: list[str] = []
    for key, val in folders.items():
        if isinstance(val, dict) and val.get("path"):
            libs.append(str(val["path"]).replace("\\\\", "\\"))
    for lib in libs:
        apps = Path(lib) / "steamapps"
        if not apps.is_dir():
            continue
        _PROGRESS(f"Steam: {apps.parent.name}")
        for manifest in apps.glob("appmanifest_*.acf"):
            try:
                data = parse_vdf(manifest.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            state = data.get("AppState", data)
            name = (state.get("name") or "").strip()
            appid = state.get("appid", "")
            installdir = (state.get("installdir") or "").strip()
            if not name or not installdir:
                continue
            exe = _find_game_exe(apps / "common" / installdir)
            games.append(
                Game(
                    name=name, platform="steam", exe_path=str(exe or ""),
                    launch_cmd=f"steam://rungameid/{appid}", appid=str(appid),
                    profile_id=find_profile(name, str(exe)).id,
                )
            )
    return games


def _find_game_exe(folder: Path) -> Optional[Path]:
    """Escolhe o .exe mais provável do jogo (o maior, fora Binários de SDKs)."""
    if not folder.is_dir():
        return None
    best: Optional[Path] = None
    best_size = -1
    for exe in folder.rglob("*.exe"):
        low = exe.name.lower()
        if any(
            t in low
            for t in ("unins", "crash", "redist", "dxsetup", "vc_redist", "unitycrash")
        ):
            continue
        if any(part.lower() in ("binaries", "redist", "directx", "support", "steamworks")
               for part in exe.parts):
            continue
        try:
            size = exe.stat().st_size
        except OSError:
            continue
        if size > best_size:
            best, best_size = exe, size
    return best


def scan_epic() -> list[Game]:
    games: list[Game] = []
    base = Path(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests")
    if not base.is_dir():
        return games
    _PROGRESS("Epic Games: manifestos")
    for item in base.glob("*.item"):
        try:
            data = json.loads(item.read_text(encoding="utf-8", errors="replace"))
        except (json.JSONDecodeError, OSError):
            continue
        name = (data.get("DisplayName") or "").strip()
        install = (data.get("InstallLocation") or "").strip()
        exe_rel = (data.get("LaunchExecutable") or "").strip()
        if not name:
            continue
        exe = Path(install) / exe_rel if install and exe_rel else _find_game_exe(Path(install)) if install else None
        ns = data.get("CatalogNamespace", "")
        cid = data.get("CatalogItemId", "")
        an = data.get("AppName", "")
        launch = (
            f"com.epicgames.launcher://apps/{ns}:{cid}:{an}?action=launch&silent=true"
            if ns and cid and an else ""
        )
        games.append(
            Game(
                name=name, platform="epic", exe_path=str(exe) if exe else "",
                launch_cmd=launch, profile_id=find_profile(name, str(exe or "")).id,
            )
        )
    return games


def scan_riot() -> list[Game]:
    games: list[Game] = []
    roots = [Path(r"C:\Riot Games"), Path(r"D:\Riot Games")]
    for root in roots:
        if not root.is_dir():
            continue
        _PROGRESS(f"Riot: {root}")
        valorant_exe = root / "VALORANT" / "ShooterGame" / "Binaries" / "Win64" / "VALORANT-Win64-Shipping.exe"
        if valorant_exe.is_file():
            games.append(Game(name="VALORANT", platform="riot", exe_path=str(valorant_exe),
                              profile_id="valorant"))
        lol_exe = root / "League of Legends" / "LeagueClient.exe"
        if lol_exe.is_file():
            games.append(Game(name="League of Legends", platform="riot", exe_path=str(lol_exe),
                              profile_id="lol"))
    return games


_LNK_RESOLVE_PS = (
    "$sh = New-Object -ComObject WScript.Shell;"
    "Get-ChildItem -Path \"{startmenu1}\",\"{startmenu2}\" -Recurse -Include *.lnk"
    " -ErrorAction SilentlyContinue | ForEach-Object {"
    "  $l = $sh.CreateShortcut($_.FullName);"
    "  [PSCustomObject]@{ Name = $_.BaseName; Target = $l.TargetPath }"
    "} | ConvertTo-Json -Compress"
)

# Marcadores de diretórios/plataformas reconhecidos nos atalhos.
_GAME_DIR_HINTS = (
    "steamapps\\common", "epic games", "epicgames", "riot games", "battle.net",
    "battlenet", "gog galaxy", "gog games", "ubisoft", "ubisoft game launcher",
    "ea games", "electronic arts", "windowsapps", "xboxgames",
)
_KNOWN_GAME_EXES = (
    "genshinimpact", "honkai", "starrail", "efootball", "efootball", "pro evolution",
    "fifa", "fc24", "efc", "need for speed", "thesims", "battlefield", "farcry",
    "assassin's creed", "hogwarts", "eldenring", "baldur", "cyberpunk", "witcher",
    "reddead", "rocketleague", "overwatch", "diablo", "hearthstone", "wowclassic",
    "destiny2", "warframe", "pathofexile", "dota2", "team fortress", "left4dead",
    "gta5", "gtaiv", "minecraft", "roblox", "terraria", "subnautica", "rust",
)


def scan_start_menu() -> list[Game]:
    """Battle.net/EA/Ubisoft/GOG/Xbox: atalhos do Menu Iniciar resolvidos."""
    import os

    user_sm = os.environ.get("APPDATA", "")
    common_sm = os.environ.get("ProgramData", "")
    if not user_sm:
        return []
    _PROGRESS("Menu Iniciar: atalhos de jogos")
    cmd = _LNK_RESOLVE_PS.format(
        startmenu1=user_sm + r"\Microsoft\Windows\Start Menu\Programs",
        startmenu2=common_sm + r"\Microsoft\Windows\Start Menu\Programs",
    )
    rows = ps.run_ps_json(cmd, timeout=60)
    games: list[Game] = []
    if not rows:
        return games
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = (r.get("Name") or "").strip()
        target = (r.get("Target") or "").strip()
        if not name or not target:
            continue
        low = target.lower().replace("/", "\\")
        if any(t in low for t in ("unins", "uninstall", "cleanup")):
            continue
        is_game_dir = any(h in low for h in _GAME_DIR_HINTS)
        is_known_exe = any(h in low for h in _KNOWN_GAME_EXES)
        # Battle.net cria atalhos com alvo no próprio launcher: mantém (uri real).
        if is_game_dir or is_known_exe or "battle.net" in low or "battlenet" in low:
            games.append(
                Game(
                    name=name, platform="battlenet" if "battle.net" in low else "other",
                    exe_path=target,
                    launch_cmd=str(Path(target)) if target.lower().endswith(".exe") else "",
                    profile_id=find_profile(name, target).id,
                )
            )
    return games


def scan_all(progress: Callable[[str], None] = lambda m: None) -> list[Game]:
    """Varredura completa. Erros individuais não interrompem a varredura."""
    global _PROGRESS
    _PROGRESS = progress
    games: list[Game] = []
    for scanner in (scan_steam, scan_epic, scan_riot, scan_start_menu):
        try:
            games.extend(scanner())
        except Exception as exc:  # noqa: BLE001
            log.exception("scanner %s falhou: %s", scanner.__name__, exc)
    # Deduplica por nome+plataforma.
    seen: set[tuple[str, str]] = set()
    unique: list[Game] = []
    for g in games:
        key = (g.name.lower(), g.platform)
        if key not in seen:
            seen.add(key)
            unique.append(g)
    return unique
