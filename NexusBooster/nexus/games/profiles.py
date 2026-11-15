"""Perfis de otimização por jogo.

Princípios:
- Recomendações reais e verificáveis por jogo (configurações do próprio jogo);
- Parâmetros de inicialização apenas com documentação do efeito;
- NUNCA prometer aumento garantido de FPS.
"""

from __future__ import annotations

from nexus.games.models import GameProfile, LaunchOption

# Aplicativos em segundo plano considerados seguros de suspender durante um jogo
# (suspenso = retomado ao encerrar; nada é fechado à força).
COMMON_SUSPEND = [
    "OneDrive.exe", "Spotify.exe", "Skype.exe", "widgets.exe",
    "PhoneExperienceHost.exe", "msteams.exe", "MicrosoftTeams.exe",
    "GameBar.exe", "skypehost.exe", "YourPhone.exe",
]


def _p(profile_id: str, game: str, keywords: list[str], processes: list[str],
       recs: list[str], options: list[LaunchOption] | None = None,
       extra_suspend: list[str] | None = None, note: str = "") -> GameProfile:
    return GameProfile(
        id=profile_id, game_name=game, match_keywords=keywords,
        process_names=processes, recommendations=recs,
        launch_options=options or [], extra_suspend=extra_suspend or [],
        platform_note=note,
    )


BUILTIN_PROFILES: list[GameProfile] = [
    _p(
        "valorant", "VALORANT", ["valorant"],
        ["VALORANT-Win64-Shipping.exe", "RiotClientServices.exe", "vgtray.exe"],
        [
            "No jogo: em Vídeo, priorize FPS — desative 'Melhorar Nitidez' e V-Sync; "
            "reduza Qualidade de Material, Detalhes e Sombras para ganhar quadros.",
            "Modo Multithreaded Rendering deve estar ATIVO (usa mais núcleos da CPU).",
            "Feche o Riot Client antes de jogar outros jogos — ele continua em segundo plano.",
            "Nvidia Reflex + Boost reduz a latência em PCs com GPU NVIDIA (GTX 900+).",
        ],
        note="Riot Games (Riot Client)",
    ),
    _p(
        "lol", "League of Legends", ["league of legends", "leagueclient"],
        ["LeagueClient.exe", "League of Legends.exe"],
        [
            "No cliente: ative 'Fechar cliente durante o jogo' (Libera ~300 MB de RAM).",
            "No jogo: desative 'Esperar por Sincronia Vertical' e Sombras.",
        ],
        note="Riot Games (Riot Client)",
    ),
    _p(
        "cs2", "Counter-Strike 2", ["cs2", "counter-strike"],
        ["cs2.exe", "steam.exe"],
        [
            "No jogo: use modo de renderização 'Multiprocessador com Multinúcleo'; "
            "desative Sincronia Vertical e Motion Blur.",
            "Steam > Configurações > No jogo: desative a sobreposição se não usa.",
        ],
        options=[
            LaunchOption("-high", "Prioridade alta do processo",
                         "Marca o jogo com prioridade 'Alta' no Windows. "
                         "Em CPUs muito ocupadas pode causar instabilidade — teste."),
            LaunchOption("-novid", "Pular vídeo de abertura",
                         "Ignora a animação inicial ao abrir o jogo."),
        ],
        note="Steam",
    ),
    _p(
        "fortnite", "Fortnite", ["fortnite", "fortniteclient", "epicgames"],
        ["FortniteClient-Win64-Shipping.exe", "FortniteClient-Win64-Shipping_BE.exe"],
        [
            "No jogo: modo de desempenho DX12 e 'Memória de textura' conforme sua VRAM.",
            "Desative: Ray Tracing, Sombras de alta, Efeitos volumétricos e Reflexos.",
            "Epic Games Launcher > Configurações: desative a sobreposição se não usa.",
            "Nvidia Reflex 'Ativado + Boost' reduz latência (não aumenta FPS).",
        ],
        note="Epic Games",
    ),
    _p(
        "gtav", "GTA V", ["gta5", "gta v", "grand theft auto v", "gta online"],
        ["GTA5.exe"],
        [
            "No jogo: em Gráficos, ignore os limites de MSAA e FXAA; "
            "a Configuração Avançada consome muitos quadros — use 'Normal'.",
            "Desative a sobreposição do Rockstar/Steam durante o jogo.",
        ],
        note="Rockstar/Steam/Epic",
    ),
    _p(
        "fivem", "GTA RP / FiveM", ["fivem", "gta_rp"],
        ["FiveM.exe", "FiveM_GTAProcess.exe", "FiveM_ChromeBrowser.exe"],
        [
            "FiveM usa os arquivos do GTA V — mantenha o GTA atualizado.",
            "No servidor, mods de textura pesam mais que qualquer ajuste do Windows.",
            "Feche navegadores: servidores RP com many players usam bastante RAM.",
        ],
        extra_suspend=["steam.exe", "EpicGamesLauncher.exe"],
        note="FiveM (requer GTA V original)",
    ),
    _p(
        "roblox", "Roblox", ["roblox"],
        ["RobloxPlayerBeta.exe"],
        [
            "Nas configurações do Roblox: gráficos manuais em 1-3 para PCs modestos.",
            "A About/10 FPS mode economiza bateria, não use em desktop.",
        ],
        note="Roblox Launcher",
    ),
    _p(
        "minecraft", "Minecraft", ["minecraft", "javaw"],
        ["javaw.exe", "minecraft.exe", "Minecraft.exe", "MinecraftLauncher.exe"],
        [
            "No Launcher: aloque 2–4 GB de RAM (mais que isso costuma PIORAR).",
            "No jogo: Render Distance 8–12, nuvens off e gráficos 'Rápido' ganham quadros.",
            "Prefira a versão do Launcher oficial; modpacks pesam conforme os mods.",
        ],
        note="Minecraft Launcher",
    ),
    _p(
        "cod", "Call of Duty", ["cod", "callduty", "modern warfare", "warzone", "blackops"],
        ["cod.exe", "Cod.exe", "Warzone.exe", "BlackOpsColdWar.exe"],
        [
            "No jogo: priorize FSR 2/DLSS quando disponível em 'Qualidade'.",
            "Desative: Motion Blur, Film Grain, World Motion Blur e Screen Space Reflections.",
            "Warzone usa muita VRAM: textures em 'Alto' só com 8 GB+ de VRAM.",
        ],
        note="Battle.net/Steam",
    ),
    _p(
        "apex", "Apex Legends", ["apex", "r5apex"],
        ["r5apex.exe"],
        [
            "No jogo: desative V-Sync e reduza 'Model Detail' e 'Sun Shadow Detail'.",
            "Streaming de textura em 'Nenhum' se tiver pouca VRAM.",
        ],
        options=[
            LaunchOption("+fps_max 0", "Remover limite de FPS",
                         "Deixa o jogo renderizar sem trava de quadros (monitor)."),
            LaunchOption("-high", "Prioridade alta do processo",
                         "Marca o jogo com prioridade 'Alta'. Teste a estabilidade."),
        ],
        note="Steam/EA App",
    ),
    _p(
        "pubg", "PUBG: BATTLEGROUNDS", ["pubg", "tslgame"],
        ["TslGame.exe", "TslGame_BE.exe"],
        [
            "No jogo: desativar 'Ajuste dinâmico de resolução' se quiser nitidez constante.",
            "Reduza Sombras e Anti-Aliasing primeiro — são as opções mais pesadas.",
        ],
        note="Steam",
    ),
    _p(
        "r6", "Rainbow Six Siege", ["rainbowsix", "r6"],
        ["RainbowSix.exe", "RainbowSix_Vulkan.exe", "RainbowSix_BE.exe"],
        [
            "Prefira a versão Vulkan — costuma ter mais FPS em CPUs com muitos núcleos.",
            "No jogo: Reflexo em 'Desligado', Sombras em 'Médio' ou menor.",
        ],
        options=[
            LaunchOption("-high", "Prioridade alta do processo",
                         "Marca o jogo com prioridade 'Alta'. Teste a estabilidade."),
        ],
        note="Steam/Ubisoft Connect",
    ),
    _p(
        "generic", "Outros jogos", [],
        [],
        [
            "Perfil genérico: plano de energia desempenho + suspensão de apps em segundo plano.",
            "Nas configurações do próprio jogo, prefira reduzir sombras, "
            "anti-aliasing e efeitos volumétricos primeiro.",
        ],
        note="Aplicável a qualquer jogo",
    ),
]


def find_profile(game_name: str, exe_path: str = "") -> GameProfile:
    """Encontra o perfil pelo nome do jogo ou caminho do executável."""
    hay = f"{game_name} {exe_path}".lower()
    for prof in BUILTIN_PROFILES:
        if prof.id == "generic":
            continue
        for kw in prof.match_keywords:
            if kw in hay:
                return prof
    return next((p for p in BUILTIN_PROFILES if p.id == "generic"), BUILTIN_PROFILES[-1])


def get_profile(profile_id: str) -> GameProfile:
    for p in BUILTIN_PROFILES:
        if p.id == profile_id:
            return p
    return find_profile("generic")
