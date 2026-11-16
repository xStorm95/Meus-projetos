"""Limpeza avançada de arquivos temporários e cache — segura e auditável.

Regras:
- Somente categorias com raízes explicitamente aprovadas;
- Nunca segue links/saídas da raiz (safety.validate_delete_path);
- Nunca apaga extensões de documentos/mídia/saves;
- Arquivos em uso falham silenciosamente (contabilizados como "ignorados");
- Relatório completo do espaço liberado.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

from nexus.core import safety

log = logging.getLogger("nexus.cleaner")

# Idade mínima de arquivos temporários para exclusão (segundos).
MIN_AGE_SECS = 600


@dataclass
class CategoryResult:
    files: int = 0
    bytes: int = 0
    errors: int = 0
    roots: list[Path] = field(default_factory=list)


@dataclass
class CleanReport:
    freed_bytes: int = 0
    deleted: int = 0
    skipped: int = 0
    errors: int = 0
    per_category: dict[str, CategoryResult] = field(default_factory=dict)

    @property
    def freed_mb(self) -> float:
        return self.freed_bytes / 1024**2


def _env(name: str) -> Path:
    v = os.environ.get(name)
    return Path(v) if v else Path()


@dataclass
class Category:
    id: str
    label: str
    description: str
    risk: str  # baixo | médio
    needs_admin: bool
    roots: Callable[[], list[Path]]
    patterns: tuple[str, ...] = ("*",)  # globs relativos às raízes


def _windows_temp() -> list[Path]:
    root = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Temp"
    return [root] if root.is_dir() else []


def _user_temp() -> list[Path]:
    return [_env("TEMP")] if _env("TEMP").is_dir() else []


def _thumbnail_cache() -> list[Path]:
    base = _env("LOCALAPPDATA") / "Microsoft" / "Windows" / "Explorer"
    return [base] if base.is_dir() else []


def _directx_cache() -> list[Path]:
    la = _env("LOCALAPPDATA")
    return [p for p in (
        la / "D3DSCache",
        la / "NVIDIA" / "DXCache",
        la / "NVIDIA" / "GLCache",
        la / "AMD" / "DxCache",
        la / "AMD" / "DxcCache",
        la / "Intel" / "ShaderCache",
    ) if p.is_dir()]


def _browser_cache(base: Path) -> list[Path]:
    """Caches de todos os perfis de navegadores Chromium/Firefox."""
    out: list[Path] = []
    ud = base / "User Data"
    if ud.is_dir():
        for profile in ud.iterdir():
            if not profile.is_dir() or profile.name in ("ShaderCache", "GrShaderCache"):
                continue
            for sub in (
                profile / "Cache" / "Cache_Data",
                profile / "Code Cache",
                profile / "GPUCache",
                profile / "Service Worker" / "CacheStorage",
            ):
                if sub.is_dir():
                    out.append(sub)
    elif base.is_dir():
        # Firefox: base aponta para a pasta Profiles
        for profile in base.glob("*.*"):
            cache2 = profile / "cache2"
            if cache2.is_dir():
                out.append(cache2)
    return out


def _chrome_cache() -> list[Path]:
    return _browser_cache(_env("LOCALAPPDATA") / "Google" / "Chrome")


def _edge_cache() -> list[Path]:
    return _browser_cache(_env("LOCALAPPDATA") / "Microsoft" / "Edge")


def _firefox_cache() -> list[Path]:
    return _browser_cache(_env("APPDATA") / "Mozilla" / "Firefox" / "Profiles")


def _wer_reports() -> list[Path]:
    roots = []
    for base in (
        _env("APPDATA") / "Microsoft" / "Windows" / "WER",
        Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Microsoft" / "Windows" / "WER",
    ):
        for sub in ("ReportQueue", "ReportArchive"):
            p = base / sub
            if p.is_dir():
                roots.append(p)
    return roots


def _delivery_optimization() -> list[Path]:
    p = Path(
        os.environ.get("SystemRoot", r"C:\Windows")
    ) / "ServiceProfiles" / "NetworkService" / "AppData" / "Local" / "Microsoft" / "Windows" / "DeliveryOptimization" / "Cache"
    return [p] if p.is_dir() else []


def _windows_update_cache() -> list[Path]:
    p = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "SoftwareDistribution" / "Download"
    return [p] if p.is_dir() else []


def _launcher_cache() -> list[Path]:
    """Caches de launchers de jogos (navegadores embutidos — nunca saves)."""
    la = _env("LOCALAPPDATA")
    roots = []
    epic = la / "EpicGamesLauncher" / "Saved"
    if epic.is_dir():
        for sub in ("webcache", "webcache_cepauce"):
            p = epic / sub
            if p.is_dir():
                roots.append(p)
    steam = Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Steam"
    if not steam.is_dir():
        steam = Path("C:\\Program Files\\Steam")
    p = steam / "appcache" / "htmlcache"
    if p.is_dir():
        roots.append(p)
    return roots


def _game_temp() -> list[Path]:
    """Temporários conhecidos de jogos/launchers dentro da pasta TEMP do usuário."""
    temp = _env("TEMP")
    if not temp.is_dir():
        return []
    markers = ("riot", "epic", "battle.net", "steam", "unity", "unreal", "crashdumps")
    out = []
    try:
        for child in temp.iterdir():
            if child.is_dir() and any(m in child.name.lower() for m in markers):
                out.append(child)
    except OSError:
        pass
    return out


CATEGORIES: list[Category] = [
    Category("temp_user", "Arquivos temporários do usuário",
             "Arquivos temporários criados por aplicativos na pasta %TEMP%.",
             "baixo", False, _user_temp),
    Category("temp_windows", "Temporários do Windows",
             "Pasta C:\\Windows\\Temp (requer administrador).",
             "baixo", True, _windows_temp),
    Category("thumbnails", "Cache de miniaturas",
             "Miniaturas do Explorador de Arquivos (recriadas automaticamente).",
             "baixo", False, _thumbnail_cache, patterns=("thumbcache_*.db", "iconcache_*.db")),
    Category("directx_cache", "Cache de shaders (DirectX/NVIDIA/AMD/Intel)",
             "Shaders compilados em cache — são recriados pelos jogos quando necessário.",
             "baixo", False, _directx_cache),
    Category("browser_chrome", "Cache do Google Chrome",
             "Cache de navegação de todos os perfis (não afeta senhas/histórico).",
             "baixo", False, _chrome_cache),
    Category("browser_edge", "Cache do Microsoft Edge",
             "Cache de navegação de todos os perfis (não afeta senhas/histórico).",
             "baixo", False, _edge_cache),
    Category("browser_firefox", "Cache do Mozilla Firefox",
             "Cache de navegação de todos os perfis (não afeta senhas/histórico).",
             "baixo", False, _firefox_cache),
    Category("wer", "Relatórios de erros do Windows",
             "Relatórios de falhas já enviados/armazenados pelo Windows.",
             "baixo", False, _wer_reports),
    Category("delivery_opt", "Cache do Delivery Optimization",
             "Cache P2P de atualizações do Windows (rebaixado se necessário).",
             "baixo", True, _delivery_optimization),
    Category("win_update", "Cache do Windows Update",
             "Arquivos de atualização já instalados (o Windows baixa novamente se preciso).",
             "médio", True, _windows_update_cache),
    Category("launcher_cache", "Cache de launchers (Steam/Epic)",
             "Cache de navegadores embutidos dos launchers. Não toca em jogos nem saves.",
             "baixo", False, _launcher_cache),
    Category("game_temp", "Temporários de jogos",
             "Pastas temporárias de jogos/launchers dentro de %TEMP%.",
             "baixo", False, _game_temp),
]


def get_category(cat_id: str) -> Optional[Category]:
    for c in CATEGORIES:
        if c.id == cat_id:
            return c
    return None


def _iter_files(root: Path, patterns: tuple[str, ...]):
    for pattern in patterns:
        if pattern == "*":
            try:
                for dirpath, dirnames, filenames in os.walk(root, topdown=True):
                    # não desce em junctions/symlinks
                    dirnames[:] = [
                        d for d in dirnames
                        if not (Path(dirpath) / d).is_symlink()
                    ]
                    for fn in filenames:
                        yield Path(dirpath) / fn
            except (OSError, PermissionError):
                continue
        else:
            try:
                yield from root.glob(pattern)
            except (OSError, PermissionError):
                continue


def analyze(cat_ids: list[str], progress: Optional[Callable[[str], None]] = None) -> dict[str, CategoryResult]:
    """Calcula tamanho removível por categoria (sem excluir nada)."""
    results: dict[str, CategoryResult] = {}
    for cid in cat_ids:
        cat = get_category(cid)
        if cat is None:
            continue
        if progress:
            progress(cat.label)
        res = CategoryResult(roots=cat.roots())
        for root in res.roots:
            for f in _iter_files(root, cat.patterns):
                try:
                    if not f.is_file():
                        continue
                    if safety.has_protected_extension(f):
                        continue
                    st = f.stat()
                    import time as _t

                    if _t.time() - st.st_mtime < MIN_AGE_SECS:
                        continue
                    res.files += 1
                    res.bytes += st.st_size
                except (OSError, PermissionError):
                    res.errors += 1
        results[cid] = res
    return results


def clean(
    cat_ids: list[str],
    progress: Optional[Callable[[str, int], None]] = None,
) -> CleanReport:
    """Exclui arquivos das categorias selecionadas. Retorna relatório real."""
    report = CleanReport()
    for cid in cat_ids:
        cat = get_category(cid)
        if cat is None:
            continue
        res = CategoryResult(roots=cat.roots())
        if progress:
            progress(cat.label, 0)
        idx = 0
        for root in res.roots:
            try:
                root_resolved = root.resolve()
            except OSError:
                continue
            for f in _iter_files(root, cat.patterns):
                idx += 1
                if progress and idx % 50 == 0:
                    progress(cat.label, idx)
                try:
                    if not f.is_file() or safety.has_protected_extension(f):
                        continue
                    import time as _t

                    if _t.time() - f.stat().st_mtime < MIN_AGE_SECS:
                        report.skipped += 1
                        continue
                    # Validação de segurança: dentro da raiz, sem saves.
                    safety.validate_delete_path(f, [root_resolved])
                    size = f.stat().st_size
                    f.unlink()
                    res.files += 1
                    res.bytes += size
                    report.deleted += 1
                    report.freed_bytes += size
                except (OSError, PermissionError):
                    report.skipped += 1
                    res.errors += 1
                except safety.SafetyError:
                    report.skipped += 1
                    log.warning("exclusão bloqueada por segurança: %s", f)
            # Pastas vazias deixadas para trás nas raízes temporárias.
            if cat.id in ("temp_user", "temp_windows", "game_temp", "launcher_cache"):
                _remove_empty_dirs(root)
        report.per_category[cid] = res
    return report


def _remove_empty_dirs(root: Path) -> None:
    try:
        for dirpath, dirnames, filenames in os.walk(root, topdown=False):
            for d in dirnames:
                p = Path(dirpath) / d
                try:
                    p.rmdir()  # só remove se estiver vazia
                except OSError:
                    pass
    except OSError:
        pass


def format_size(n: float) -> str:
    value = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < 1024 or unit == "TB":
            return f"{value:.1f} {unit}" if unit not in ("B",) else f"{int(value)} B"
        value /= 1024
    return f"{value:.1f} TB"
