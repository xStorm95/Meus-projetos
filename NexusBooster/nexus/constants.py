"""Constantes globais do aplicativo."""

import platform

APP_NAME = "DK"
APP_ID = "nexusbooster"
APP_VERSION = "1.4.0"
ORG_NAME = "DK"

# Cores base do tema (accent "roxo" = cor do ícone oficial da marca).
ACCENTS = {
    "roxo": "#673ecb",
    "neon": "#00d4ff",
    "cyan": "#22d3ee",
    "violet": "#8b5cf6",
}
DEFAULT_ACCENT = "roxo"

# Repositório / páginas de referência
PRESENTMON_URL = "https://github.com/GameTechDev/PresentMon/releases"
GITHUB_URL = "https://github.com/xStorm95/Meus-projetos"

# Intervalo padrão de monitoramento (ms)
DEFAULT_MONITOR_INTERVAL = 1000

IS_WINDOWS = platform.system() == "Windows"
