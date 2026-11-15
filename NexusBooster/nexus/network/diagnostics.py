"""Diagnóstico e ferramentas de rede — medidas reais, nada inventado.

- Ping ICMP via comando do sistema (parse multilíngue);
- Ping TCP (funciona sem admin em qualquer SO);
- Teste de velocidade via download/upload real (Cloudflare);
- Diagnóstico de DNS e recomendação baseada em latência medida;
- Reparos (flushdns, renovação DHCP, winsock) somente com autorização.
"""

from __future__ import annotations

import json
import logging
import re
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

from nexus.system import powershell as ps

log = logging.getLogger("nexus.network")

SPEED_DOWNLOAD_URL = "https://speed.cloudflare.com/__down?bytes={bytes}"
SPEED_UPLOAD_URL = "https://speed.cloudflare.com/__up"
POPULAR_DNS = [
    ("Cloudflare", "1.1.1.1"),
    ("Google", "8.8.8.8"),
    ("Quad9", "9.9.9.9"),
    ("OpenDNS", "208.67.222.222"),
]


@dataclass
class PingResult:
    host: str
    samples: list[float] = field(default_factory=list)
    loss: float = 0.0
    error: str = ""

    @property
    def avg(self) -> Optional[float]:
        return round(sum(self.samples) / len(self.samples), 1) if self.samples else None

    @property
    def min(self) -> Optional[float]:
        return min(self.samples) if self.samples else None

    @property
    def max(self) -> Optional[float]:
        return max(self.samples) if self.samples else None


def ping_icmp(host: str, count: int = 4, timeout: int = 10) -> PingResult:
    """Ping ICMP real usando o comando do sistema (saída multilíngue-safe)."""
    result = PingResult(host=host)
    import platform
    import subprocess

    flag = "-n" if platform.system() == "Windows" else "-c"
    creation = 0x08000000 if platform.system() == "Windows" else 0
    try:
        p = subprocess.run(
            ["ping", flag, str(count), host],
            capture_output=True, text=True, timeout=timeout + count,
            encoding="utf-8", errors="replace", creationflags=creation,
        )
        out = p.stdout or ""
    except Exception as exc:  # noqa: BLE001
        result.error = f"Falha ao executar ping: {exc}"
        return result

    # Extrai todas as latências "xx ms" / "xx,ms ms" da saída.
    values = [
        float(m.replace(",", "."))
        for m in re.findall(r"tempo[=<]\s*(\d+[.,]?\d*)\s*ms", out)
    ] or [
        float(m.replace(",", "."))
        for m in re.findall(r"time[=<]\s*(\d+[.,]?\d*)\s*ms", out, re.IGNORECASE)
    ] or [
        float(m.replace(",", "."))
        for m in re.findall(r"(\d+[.,]?\d*)\s*ms", out)
    ]
    result.samples = values[:count]

    # Perda: procura padrão (0% loss / 0% perdidos)
    m = re.search(r"(\d+)%", out)
    if m:
        result.loss = float(m.group(1))
    if not values and result.loss == 0:
        result.error = "Sem resposta do host (host inalcançável ou firewall)."
    return result


def ping_tcp(host: str, port: int = 443, samples: int = 4) -> PingResult:
    """Latência de conexão TCP (RTT real, sem precisar de admin)."""
    result = PingResult(host=f"{host}:{port}")
    for _ in range(samples):
        t0 = time.time()
        try:
            with socket.create_connection((host, port), timeout=3):
                result.samples.append(round((time.time() - t0) * 1000, 1))
        except OSError as exc:
            result.error = f"Falha de conexão: {exc}"
            break
        time.sleep(0.15)
    return result


@dataclass
class SpeedResult:
    download_mbps: float = 0.0
    upload_mbps: float = 0.0
    error: str = ""
    downloaded_mb: float = 0.0
    uploaded_mb: float = 0.0

    @property
    def ok(self) -> bool:
        return not self.error and (self.download_mbps > 0 or self.upload_mbps > 0)


def speed_test(progress=None) -> SpeedResult:
    """Mede vazão real baixando (e enviando) dados do servidor da Cloudflare.

    É uma estimativa de pico — resultado varia com a rede e o servidor.
    """
    result = SpeedResult()

    # Download: começa com 10 MB; se rápido, refaz com 40 MB.
    for size in (10_000_000, 40_000_000):
        try:
            if progress:
                progress(f"Baixando {size // 1_000_000} MB...")
            t0 = time.time()
            req = urllib.request.Request(
                SPEED_DOWNLOAD_URL.format(bytes=size), method="GET"
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                data = resp.read()
            dt = time.time() - t0
            if dt <= 0:
                continue
            mbps = (len(data) * 8) / dt / 1_000_000
            result.downloaded_mb = len(data) / 1_000_000
            result.download_mbps = round(mbps, 1)
            if mbps < 50 or size == 40_000_000:
                break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            result.error = f"Falha no teste de download: {exc}"
            return result

    # Upload: 2 MB.
    try:
        if progress:
            progress("Enviando 2 MB...")
        payload = b"N" * 2_000_000
        t0 = time.time()
        req = urllib.request.Request(
            SPEED_UPLOAD_URL, data=payload, method="POST"
        )
        with urllib.request.urlopen(req, timeout=30):
            pass
        dt = time.time() - t0
        if dt > 0:
            result.upload_mbps = round((len(payload) * 8) / dt / 1_000_000, 1)
            result.uploaded_mb = len(payload) / 1_000_000
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        log.info("upload test falhou: %s", exc)

    return result


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "indisponível"


def get_dns_servers() -> list[dict]:
    """Servidores DNS ativos por interface: [{interface, servers:[...]}]."""
    rows = ps.run_ps_json(
        "Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue"
        " | Where-Object {$_.ServerAddresses} |"
        " Select-Object InterfaceAlias,ServerAddresses"
    )
    out: list[dict] = []
    for r in rows or []:
        if isinstance(r, dict) and r.get("ServerAddresses"):
            servers = r["ServerAddresses"]
            if isinstance(servers, str):
                servers = [servers]
            out.append({"interface": r.get("InterfaceAlias", ""), "servers": list(servers)})
    return out


def measure_dns_latency() -> list[dict]:
    """Latência TCP real até a porta 53 dos DNS populares (3 amostras)."""
    results = []
    for label, ip in POPULAR_DNS:
        r = ping_tcp(ip, port=53, samples=3)
        results.append(
            {
                "label": label,
                "ip": ip,
                "avg_ms": r.avg if r.samples else None,
                "error": r.error,
            }
        )
    return sorted(results, key=lambda x: (x["avg_ms"] is None, x["avg_ms"] or 999))


def flush_dns() -> tuple[bool, str]:
    ok, _ = ps.run_cmd(["ipconfig", "/flushdns"], timeout=15)
    return (
        (True, "Cache de DNS limpo com sucesso.")
        if ok
        else (False, "Falha ao limpar cache de DNS.")
    )


def renew_dhcp() -> tuple[bool, str]:
    """Renova o endereço IP (ipconfig /release + /renew). Pode causar queda breve."""
    from nexus.core.elevation import run_elevated_ps

    ok, out = run_elevated_ps(
        "ipconfig /release | Out-Null; ipconfig /renew | Out-Null;"
        " $out += 'Endereço IP renovado.'"
    )
    return ok, out if ok else f"Falha ao renovar: {out[:200]}"


def winsock_reset() -> tuple[bool, str]:
    """netsh winsock reset — requer reinicialização. Somente com autorização."""
    from nexus.core.elevation import run_elevated_ps

    ok, out = run_elevated_ps(
        "netsh winsock reset | Out-Null; $out += 'Winsock redefinido. REINICIE o PC.'"
    )
    return ok, out if ok else f"Falha: {out[:200]}"


def apply_dns(interface: str, servers: list[str]) -> tuple[bool, str, dict]:
    """Define servidores DNS (elevação UAC). Salva anteriores para reversão."""
    current = get_dns_servers()
    previous: list[str] = []
    for entry in current:
        if entry["interface"] == interface:
            previous = entry["servers"]
            break
    from nexus.core.elevation import run_elevated_ps

    quoted = ",".join(f'"{s}"' for s in servers)
    ok, out = run_elevated_ps(
        f"Set-DnsClientServerAddress -InterfaceAlias '{interface}'"
        f" -ServerAddresses ({quoted}) -ErrorAction Stop; $out += 'DNS alterado.'"
    )
    if not ok:
        return False, f"Falha: {out[:200]}", {}
    undo = {"interface": interface, "servers": previous}
    return True, f"DNS de '{interface}' alterado para {', '.join(servers)}.", undo


def restore_dns(undo: dict) -> tuple[bool, str]:
    interface = undo.get("interface", "")
    servers = undo.get("servers", [])
    if not interface:
        return False, "Registro de undo incompleto."
    if not servers:
        # volta para automático (DHCP)
        from nexus.core.elevation import run_elevated_ps

        ok, out = run_elevated_ps(
            f"Set-DnsClientServerAddress -InterfaceAlias '{interface}'"
            " -ResetServerAddresses -ErrorAction Stop; $out += 'DNS restaurado (automático).'"
        )
        return ok, out if ok else f"Falha: {out[:200]}"
    ok, msg, _ = apply_dns(interface, servers)
    return ok, msg
