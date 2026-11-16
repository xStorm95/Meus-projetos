"""Aba Internet Boost: latência, velocidade, DNS e reparos — tudo medido de verdade."""

from __future__ import annotations

import time

from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QVBoxLayout,
    QWidget,
)

from nexus.core.worker import run_task
from nexus.network import diagnostics
from nexus.ui import icons, theme
from nexus.ui.components import (
    ensure_admin_or_warn,
    Button,
    Card,
    LineChart,
    Pill,
    StatTile,
    ThemeLabel,
    ToggleSwitch,
    confirm,
    toast_for,
)
from nexus.ui.tabs.base import BaseTab


class InternetTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        self._ping_timer = QTimer(self)
        self._ping_timer.setInterval(2000)
        self._ping_timer.timeout.connect(self._ping_tick)

        # -------------------------------------------------------------- ping
        ping_card = Card("Latência (ping)", "activity")
        row = QHBoxLayout()
        self.host_combo = QComboBox()
        for label, host in (
            ("Cloudflare (1.1.1.1)", "1.1.1.1"),
            ("Google (8.8.8.8)", "8.8.8.8"),
            ("google.com", "google.com"),
        ):
            self.host_combo.addItem(label, host)
        self.ping_btn = Button("Testar ping", "primary")
        self.ping_btn.clicked.connect(self._test_ping)
        row.addWidget(ThemeLabel("Destino:"))
        row.addWidget(self.host_combo, 1)
        row.addWidget(self.ping_btn)
        ping_card.body_layout().addLayout(row)

        self.ping_chart = LineChart(unit="ms", fixed_max=None)
        self.ping_chart.add_series("Latência", "accent")
        ping_card.body_layout().addWidget(self.ping_chart)

        stats_row = QHBoxLayout()
        stats_row.setSpacing(theme.pad("md"))
        self.ping_avg = StatTile("activity", "Média", "—")
        self.ping_min = StatTile("check", "Mínimo", "—")
        self.ping_max = StatTile("alert", "Máximo", "—")
        self.ping_loss = StatTile("x", "Perda", "—", color="danger")
        for t in (self.ping_avg, self.ping_min, self.ping_max, self.ping_loss):
            stats_row.addWidget(t)
        ping_card.body_layout().addLayout(stats_row)

        mon_row = QHBoxLayout()
        self.ping_monitor = ToggleSwitch(False)
        mon_row.addWidget(self.ping_monitor)
        mon_lbl = ThemeLabel("Monitorar continuamente (a cada 2s)", "body_sm")
        mon_row.addWidget(mon_lbl)
        mon_row.addStretch(1)
        ping_card.body_layout().addLayout(mon_row)
        self.ping_monitor.toggled.connect(self._toggle_ping_monitor)
        self.add(ping_card)

        # -------------------------------------------------------- velocidade
        speed_card = Card("Teste de velocidade", "download")
        srow = QHBoxLayout()
        self.speed_btn = Button("Iniciar teste (Cloudflare)", "primary", "download")
        self.speed_btn.clicked.connect(self._speed_test)
        srow.addWidget(self.speed_btn)
        srow.addStretch(1)
        speed_card.body_layout().addLayout(srow)
        srow2 = QHBoxLayout()
        srow2.setSpacing(theme.pad("md"))
        self.down_tile = StatTile("download", "Download", "—", "Mbps")
        self.up_tile = StatTile("upload", "Upload", "—", "Mbps")
        self.ip_tile = StatTile("globe", "Seu IP local", "—")
        srow2.addWidget(self.down_tile)
        srow2.addWidget(self.up_tile)
        srow2.addWidget(self.ip_tile)
        speed_card.body_layout().addLayout(srow2)
        note = ThemeLabel(
            "Estimativa de vazão real baixando/enviando dados ao servidor da "
            "Cloudflare. O resultado varia com a rede, Wi-Fi e horário.",
            "caption", wrap=True,
        )
        speed_card.body_layout().addWidget(note)
        self.add(speed_card)
        self.ip_tile.set_value(diagnostics.local_ip())

        # --------------------------------------------------------------- DNS
        dns_card = Card("Diagnóstico e recomendação de DNS", "server")
        drow = QHBoxLayout()
        dns_btn = Button("Testar latência dos DNS populares", "secondary", "activity")
        dns_btn.clicked.connect(self._test_dns)
        drow.addWidget(dns_btn)
        drow.addStretch(1)
        dns_card.body_layout().addLayout(drow)
        self.dns_result = QVBoxLayout()
        dns_card.body_layout().addLayout(self.dns_result)
        self.dns_current = ThemeLabel("Servidores DNS atuais: —", "body_sm", wrap=True)
        dns_card.body_layout().addWidget(self.dns_current)

        apply_row = QHBoxLayout()
        self.iface_combo = QComboBox()
        self.dns_combo = QComboBox()
        apply_btn = Button("Aplicar DNS recomendado", "secondary", "check")
        apply_btn.clicked.connect(self._apply_dns)
        apply_row.addWidget(ThemeLabel("Interface:"))
        apply_row.addWidget(self.iface_combo, 1)
        apply_row.addWidget(ThemeLabel("DNS:"))
        apply_row.addWidget(self.dns_combo, 1)
        apply_row.addWidget(apply_btn)
        dns_card.body_layout().addLayout(apply_row)
        self.add(dns_card)
        self._load_dns_current()

        # ------------------------------------------------------------ reparos
        rep_card = Card("Ferramentas de reparo de rede", "shield")
        rnote = ThemeLabel(
            "Cada reparo exige sua confirmação. Alterações de DNS são reversíveis "
            "pelo Histórico; o Winsock requer reinicialização.",
            "body_sm", wrap=True,
        )
        rep_card.body_layout().addWidget(rnote)

        def mk_repair(label: str, fn, danger: bool, desc: str, needs_admin: bool = False):
            row = QHBoxLayout()
            btn = Button(label, "danger" if danger else "secondary")
            btn.clicked.connect(lambda a=needs_admin: self._run_repair(label, desc, fn, a))
            row.addWidget(btn)
            d = ThemeLabel(desc, "caption", wrap=True)
            row.addWidget(d, 1)
            rep_card.body_layout().addLayout(row)

        mk_repair(
            "Limpar cache DNS", diagnostics.flush_dns, False,
            "ipconfig /flushdns — seguro e imediato.",
        )
        mk_repair(
            "Renovar endereço IP (DHCP)", diagnostics.renew_dhcp, True,
            "Solta e renova o IP — a internet pode cair por alguns segundos.",
        )
        mk_repair(
            "Redefinir Winsock", diagnostics.winsock_reset, True,
            "netsh winsock reset — corrige problemas de conexão. REINICIE o PC depois.",
        )
        self.add(rep_card)

    # --------------------------------------------------------------- ping
    def _test_ping(self) -> None:
        host = self.host_combo.currentData() or "1.1.1.1"
        self.ping_chart.clear()

        def job():
            return diagnostics.ping_icmp(host, count=6)

        def done(res) -> None:
            self._render_ping(res)

        run_task(job, on_done=done)

    def _render_ping(self, res) -> None:
        if res.error and not res.samples:
            self.ping_avg.set_value(res.error[:40], "falha")
            return
        for s in res.samples:
            self.ping_chart.push("Latência", s)
        self.ping_avg.set_value(f"{res.avg:.0f} ms" if res.avg is not None else "—")
        self.ping_min.set_value(f"{res.min:.0f} ms" if res.min is not None else "—")
        self.ping_max.set_value(f"{res.max:.0f} ms" if res.max is not None else "—")
        self.ping_loss.set_value(f"{res.loss:.0f} %")

    def _toggle_ping_monitor(self, on: bool) -> None:
        if on:
            self._ping_timer.start()
            self._ping_tick()
        else:
            self._ping_timer.stop()

    def _ping_tick(self) -> None:
        host = self.host_combo.currentData() or "1.1.1.1"

        def job():
            return diagnostics.ping_tcp(host, 443, samples=1)

        def done(res) -> None:
            if res.samples:
                self.ping_chart.push("Latência", res.samples[0])
                self.ping_avg.set_value(f"{res.samples[0]:.0f} ms", "TCP agora")

        run_task(job, on_done=done)

    # ---------------------------------------------------------- velocidade
    def _speed_test(self) -> None:
        self.speed_btn.setEnabled(False)
        self.speed_btn.set_loading(True, "Testando…")
        self.down_tile.set_value("testando…", "aguarde")
        self.up_tile.set_value("…", "aguarde")

        # Nota: nenhuma atualização de widget acontece na thread de fundo —
        # o resultado chega aqui via sinal (thread-safe).
        def job():
            return diagnostics.speed_test(progress=None)

        def done(res) -> None:
            self.speed_btn.setEnabled(True)
            self.speed_btn.set_loading(False)
            if res.error and not res.ok:
                self.down_tile.set_value("falha", "sem conexão")
                self.up_tile.set_value("—", "")
                toast_for(self, res.error, "error")
                return
            self.down_tile.set_value(f"{res.download_mbps:.1f}", "Mbps (download)")
            self.up_tile.set_value(f"{res.upload_mbps:.1f}", "Mbps (upload)")
            toast_for(self, "Teste de velocidade concluído.", "success")

        def fail(msg) -> None:
            self.speed_btn.setEnabled(True)
            self.speed_btn.set_loading(False)
            self.down_tile.set_value("erro", msg[:30])

        run_task(job, on_done=done, on_error=fail)

    # --------------------------------------------------------------- DNS
    def _load_dns_current(self) -> None:
        def job():
            return diagnostics.get_dns_servers(), diagnostics.measure_dns_latency()

        def done(res) -> None:
            servers, _lat = res
            if servers:
                txt = " · ".join(
                    f"{s['interface']}: {', '.join(s['servers'])}" for s in servers[:3]
                )
                self.dns_current.setText(f"Servidores DNS atuais: {txt}")
                self.iface_combo.clear()
                for s in servers:
                    self.iface_combo.addItem(s["interface"])
            else:
                self.dns_current.setText(
                    "Não foi possível ler os DNS atuais (somente Windows)."
                )

        run_task(job, on_done=done)

    def _test_dns(self) -> None:
        while self.dns_result.count():
            item = self.dns_result.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        from nexus.ui.components import SkeletonBlock

        loading = SkeletonBlock(height=14)
        self.dns_result.addWidget(loading)

        def job():
            return diagnostics.measure_dns_latency()

        def done(results) -> None:
            while self.dns_result.count():
                item = self.dns_result.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
            if not results:
                none = ThemeLabel("Teste indisponível neste ambiente.", "caption")
                self.dns_result.addWidget(none)
                return
            best = results[0]
            for r in results:
                row = QHBoxLayout()
                name = ThemeLabel(f"{r['label']} ({r['ip']})", "body_sm")
                row.addWidget(name, 1)
                if r["avg_ms"] is not None:
                    pill = Pill(f"{r['avg_ms']:.0f} ms",
                                "success" if r is best else "muted")
                else:
                    pill = Pill("sem resposta", "danger")
                row.addWidget(pill)
                host = QWidget()
                host.setLayout(row)
                self.dns_result.addWidget(host)
            rec = ThemeLabel(
                f"Recomendação baseada na medição: {best['label']} ({best['ip']}) "
                "teve a menor latência. Aplique abaixo apenas se quiser.",
                "accent", wrap=True,
            )
            self.dns_result.addWidget(rec)
            self.dns_combo.clear()
            for r in results:
                self.dns_combo.addItem(f"{r['label']} ({r['ip']})", r["ip"])

        run_task(job, on_done=done)

    def _apply_dns(self) -> None:
        iface = self.iface_combo.currentText()
        ip = self.dns_combo.currentData()
        if not iface or not ip:
            toast_for(self, "Teste os DNS e selecione interface/servidor.", "warning")
            return
        partners = {"1.1.1.1": ["1.1.1.1", "1.0.0.1"],
                    "8.8.8.8": ["8.8.8.8", "8.8.4.4"],
                    "9.9.9.9": ["9.9.9.9", "149.112.112.112"],
                    "208.67.222.222": ["208.67.222.222", "208.67.220.220"]}
        servers = partners.get(ip, [ip])

        if not confirm(
            self, "Alterar servidores DNS",
            f"Definir o DNS da interface '{iface}' para {', '.join(servers)}?\n"
            "Isso pede elevação (UAC) e fica registrado no Histórico para reversão.",
            dangerous=True, confirm_text="Aplicar DNS",
        ):
            return

        def job():
            return diagnostics.apply_dns(iface, servers)

        def done(res) -> None:
            ok, msg, undo = res
            if ok:
                self.services.db.history_add(
                    "network_dns", "DNS alterado", description=msg, undo=undo
                )
            toast_for(self, msg, "success" if ok else "error")
            self._load_dns_current()

        run_task(job, on_done=done)

    # -------------------------------------------------------------- reparos
    def _run_repair(self, label: str, desc: str, fn, needs_admin: bool = False) -> None:
        if not confirm(self, label, f"{desc}\n\nContinuar?", dangerous=True,
                       confirm_text="Executar"):
            return
        if needs_admin and not ensure_admin_or_warn(self, label):
            return

        def job():
            return fn()

        def done(res) -> None:
            ok, msg = res
            if ok:
                self.services.db.history_add("network", label, description=msg)
            toast_for(self, msg, "success" if ok else "error")

        run_task(job, on_done=done)
