#!/usr/bin/env python3
"""Nexus Booster — ponto de entrada.

Execute com:
    python main.py
"""

import sys
from pathlib import Path

# Permite rodar tanto via `python main.py` quanto `python -m nexus`
sys.path.insert(0, str(Path(__file__).resolve().parent))

from nexus.app import run  # noqa: E402

if __name__ == "__main__":
    sys.exit(run())
