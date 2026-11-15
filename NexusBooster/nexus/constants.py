"""Constantes globais do aplicativo."""

import platform

APP_NAME = "Nexus Booster"
APP_ID = "nexusbooster"
APP_VERSION = "1.0.1"
ORG_NAME = "Nexus Booster"

# Cores base do tema (azul neon).
ACCENTS = {
    "neon": "#00d4ff",
    "cyan": "#22d3ee",
    "violet": "#8b5cf6",
}
DEFAULT_ACCENT = "neon"

# Repositório / páginas de referência
PRESENTMON_URL = "https://github.com/GameTechDev/PresentMon/releases"
GITHUB_URL = "https://github.com/xStorm95/Meus-projetos"

# Intervalo padrão de monitoramento (ms)
DEFAULT_MONITOR_INTERVAL = 1000

IS_WINDOWS = platform.system() == "Windows"
