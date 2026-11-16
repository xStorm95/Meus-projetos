"""Modelos de dados de jogos."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Game:
    """Jogo detectado automaticamente ou adicionado manualmente."""
    name: str
    platform: str                    # steam | epic | riot | battlenet | manual | other
    exe_path: str = ""
    launch_cmd: str = ""             # comando de inicialização (url: ou exe)
    app_id: str = ""
    profile_id: str = "generic"
    favorite: bool = False
    manual: bool = False

    def launch_command(self, args: str = "") -> str:
        if self.launch_cmd:
            return self.launch_cmd
        if self.exe_path:
            return f'"{self.exe_path}" {args}'.strip()
        return ""


@dataclass
class LaunchOption:
    arg: str
    label: str
    description: str
    default: bool = False


@dataclass
class GameProfile:
    """Perfil de otimização por jogo — conteúdo honesto, sem promessas de FPS."""
    id: str
    game_name: str
    match_keywords: list[str] = field(default_factory=list)   # no nome do .exe (minúsculo)
    process_names: list[str] = field(default_factory=list)    # processos do jogo p/ monitorar
    recommendations: list[str] = field(default_factory=list)  # dicas reais por jogo
    launch_options: list[LaunchOption] = field(default_factory=list)
    extra_suspend: list[str] = field(default_factory=list)
    platform_note: str = ""
