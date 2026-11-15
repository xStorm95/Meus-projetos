"""Preferências do usuário persistidas no banco (com valores padrão)."""

from __future__ import annotations

from typing import Any, List

from nexus.core.database import Database


class Key:
    MONITOR_INTERVAL = "monitor_interval"          # ms
    ACCENT = "accent"                              # neon | cyan | violet
    AUTO_BOOST = "auto_boost"                      # boost automático ao detectar jogo
    AUTO_DETECT_GAMES = "auto_detect_games"
    POWER_ON_BOOST = "power_on_boost"
    RESTORE_POINT_DEFAULT = "restore_point_default"
    PRESENTMON_PATH = "presentmon_path"
    PRESENTMON_ARGS = "presentmon_args"
    SUSPEND_LIST = "suspend_list"                  # lista de processos a suspender
    LAUNCH_WITH_WINDOWS = "launch_with_windows"
    LAST_CLEAN_ANALYSIS = "last_clean_analysis"    # json {ts, total}
    BOOST_TIMER_SECS = "boost_timer_secs"
    NETWORK_MONITOR_HOST = "network_monitor_host"


DEFAULTS: dict = {
    Key.MONITOR_INTERVAL: 1000,
    Key.ACCENT: "neon",
    Key.AUTO_BOOST: False,
    Key.AUTO_DETECT_GAMES: True,
    Key.POWER_ON_BOOST: True,
    Key.RESTORE_POINT_DEFAULT: True,
    Key.PRESENTMON_PATH: "",
    Key.PRESENTMON_ARGS: "",
    Key.SUSPEND_LIST: [
        "OneDrive.exe", "Spotify.exe", "Skype.exe", "widgets.exe",
        "PhoneExperienceHost.exe", "msteams.exe", "MicrosoftTeams.exe",
        "skypehost.exe", "YourPhone.exe", "GameBar.exe",
    ],
    Key.LAUNCH_WITH_WINDOWS: False,
    Key.LAST_CLEAN_ANALYSIS: None,
    Key.BOOST_TIMER_SECS: 0,
    Key.NETWORK_MONITOR_HOST: "1.1.1.1",
}


class Settings:
    def __init__(self, db: Database):
        self._db = db

    def get(self, key: str, default: Any = None) -> Any:
        if default is None and key in DEFAULTS:
            default = DEFAULTS[key]
        return self._db.settings_get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._db.settings_set(key, value)

    # Atalhos tipados -----------------------------------------------------
    def get_int(self, key: str) -> int:
        try:
            return int(self.get(key))
        except (TypeError, ValueError):
            return 0

    def get_bool(self, key: str) -> bool:
        return bool(self.get(key, False))

    def get_str(self, key: str) -> str:
        return str(self.get(key, "") or "")

    def get_list(self, key: str) -> List[str]:
        v = self.get(key, [])
        return [str(x) for x in v] if isinstance(v, list) else []
