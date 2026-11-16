"""Aba Hardware Monitor: identificação estática + monitoramento ao vivo."""

from __future__ import annotations

from PySide6.QtWidgets import QHBoxLayout, QVBoxLayout

from nexus.ui import theme
from nexus.ui.components import (
    Card,
    CoreBars,
    GaugeRing,
    KeyInfoRow,
    LineChart,
    StatTile,
)
from nexus.ui.tabs.base import BaseTab


class HardwareMonitorTab(BaseTab):
    def __init__(self, services, main_window=None):
        super().__init__(services, main_window)
        services.monitor.hardware_ready.connect(self._on_hardware_ready)

        # --------------------------------------------------------- medidores
        rings_row = QHBoxLayout()
        rings_row.setSpacing(theme.pad("lg"))
        self.cpu_ring = GaugeRing("CPU", size=150)
        self.gpu_ring = GaugeRing("GPU", size=150)
        self.ram_ring = GaugeRing("RAM", size=150)
        self.disk_ring = GaugeRing("Disco (C:)", size=150)
        for ring in (self.cpu_ring, self.gpu_ring, self.ram_ring, self.disk_ring):
            rings_row.addWidget(ring)
        self.add_layout(rings_row)

        # ------------------------------------- destaques com sparklines 60s
        tiles_row = QHBoxLayout()
        tiles_row.setSpacing(theme.pad("md"))
        self.freq_tile = StatTile("zap", "Frequência da CPU", "—", "atual")
        self.freq_spark = self.freq_tile.add_sparkline("accent")
        self.cputemp_tile = StatTile("thermometer", "Temperatura CPU", "N/D",
                                     color="warning")
        self.cputemp_spark = self.cputemp_tile.add_sparkline("warning")
        self.gputemp_tile = StatTile("fan", "Temperatura GPU", "N/D", color="warning")
        self.gputemp_spark = self.gputemp_tile.add_sparkline("warning")
        self.procs_tile = StatTile("list", "Processos", "—")
        self.uptime_tile = StatTile("clock", "Uptime", "—")
        for tile in (self.freq_tile, self.cputemp_tile, self.gputemp_tile,
                     self.procs_tile, self.uptime_tile):
            tiles_row.addWidget(tile)
        self.add_layout(tiles_row)

        # ------------------------------------------------------------ gráficos
        charts_row = QHBoxLayout()
        charts_row.setSpacing(theme.pad("md"))
        cpu_card = Card("CPU por núcleo", "cpu")
        self.core_bars = CoreBars()
        cpu_card.body_layout().addWidget(self.core_bars)
        charts_row.addWidget(cpu_card)

        freq_card = Card("Frequência da CPU", "zap")
        self.freq_chart = LineChart(unit="MHz", fixed_max=None)
        self.freq_chart.add_series("MHz", "accent")
        freq_card.body_layout().addWidget(self.freq_chart)
        charts_row.addWidget(freq_card)
        self.add_layout(charts_row)

        io_row = QHBoxLayout()
        io_row.setSpacing(theme.pad("md"))
        disk_card = Card("Disco — leitura/escrita", "disk")
        self.disk_chart = LineChart(unit="MB/s", fixed_max=None)
        self.disk_chart.add_series("Leitura", "accent")
        self.disk_chart.add_series("Escrita", "success")
        disk_card.body_layout().addWidget(self.disk_chart)
        io_row.addWidget(disk_card)

        net_card = Card("Rede — download/upload", "globe")
        self.net_chart = LineChart(unit="MB/s", fixed_max=None)
        self.net_chart.add_series("Download", "accent")
        self.net_chart.add_series("Upload", "success")
        net_card.body_layout().addWidget(self.net_chart)
        io_row.addWidget(net_card)
        self.add_layout(io_row)

        # ------------------------------------------------------- identificação
        hw_card = Card("Identificação do hardware", "cpu")
        cols = QHBoxLayout()
        cols.setSpacing(theme.pad("xl"))
        self.col1 = QVBoxLayout()
        self.col2 = QVBoxLayout()
        cols.addLayout(self.col1)
        cols.addLayout(self.col2)
        hw_card.body_layout().addLayout(cols)
        self.add(hw_card)

        # ------------------------------------------------------- discos
        disks_card = Card("Unidades de disco", "disk")
        self.disks_box = QVBoxLayout()
        disks_card.body_layout().addLayout(self.disks_box)
        self.add(disks_card)

        self._fill_static(HardwareInfoPlaceholder())

    class _HWProxy:
        """Placeholder até o probe real concluir."""

        cpu_name = "Detectando…"
        cpu_cores_physical = 0
        cpu_cores_logical = 0
        cpu_max_freq_mhz = None
        gpu_names: list = []
        gpu_driver = ""
        ram_total_gb = 0
        ram_sticks: list = []
        disks: list = []
        motherboard = ""
        os_name = ""
        os_build = ""

    def _fill_static(self, hw) -> None:
        for col in (self.col1, self.col2):
            while col.count():
                item = col.takeAt(0)
                if item.widget():
                    item.widget().deleteLater()

        ram_speeds = [s.speed_mhz for s in hw.ram_sticks if s.speed_mhz]
        ram_desc = f"{hw.ram_total_gb:.1f} GB" if hw.ram_total_gb else "Detectando…"
        if ram_speeds:
            ram_desc += f" @ {ram_speeds[0]} MHz"

        c1 = [
            ("Processador", hw.cpu_name, "cpu"),
            ("Núcleos",
             f"{hw.cpu_cores_physical} físicos / {hw.cpu_cores_logical} lógicos"
             if hw.cpu_cores_logical else "—", "cpu"),
            ("Frequência máxima",
             f"{hw.cpu_max_freq_mhz/1000:.2f} GHz" if hw.cpu_max_freq_mhz else "—",
             "zap"),
            ("Memória RAM", ram_desc, "ram"),
        ]
        sticks = "; ".join(
            f"{s.slot}: {s.size_gb} GB"
            f"{f' {s.speed_mhz} MHz' if s.speed_mhz else ''} {s.manufacturer}".strip()
            for s in hw.ram_sticks
        ) or "detalhes não disponíveis"
        c2 = [
            ("Placa de vídeo",
             hw.gpu_names[0] if hw.gpu_names else "Detectando…", "gpu"),
            ("Driver da GPU", hw.gpu_driver or "—", "gpu"),
            ("Módulos de RAM", sticks, "ram"),
            ("Placa-mãe", hw.motherboard or "—", "cpu"),
        ]
        for label, value, ic in c1:
            self.col1.addWidget(KeyInfoRow(label, value, ic))
        for label, value, ic in c2:
            self.col2.addWidget(KeyInfoRow(label, value, ic))
        self.col1.addStretch(1)
        self.col2.addStretch(1)

        while self.disks_box.count():
            item = self.disks_box.takeAt(0)
            if item.widget():
                item.widget().deleteLater()
        for d in hw.disks:
            self.disks_box.addWidget(
                KeyInfoRow(
                    "Disco físico",
                    f"{d.model} — {d.size_gb:.0f} GB"
                    f"{f' ({d.interface})' if d.interface else ''}",
                    "disk",
                )
            )
        self.disks_box.addWidget(
            KeyInfoRow(
                "Sistema operacional",
                f"{hw.os_name} (build {hw.os_build})" if hw.os_build else "Detectando…",
                "windows",
            )
        )
        self.disks_box.addStretch(1)

    def _on_hardware_ready(self, hw) -> None:
        self._fill_static(hw)

    # ------------------------------------------------------------------ ao vivo
    def on_monitor_update(self, snap) -> None:
        self.cpu_ring.set_value(snap.cpu_percent)
        if snap.gpu and snap.gpu.utilization is not None:
            self.gpu_ring.set_value(snap.gpu.utilization, snap.gpu.name[:24])
        else:
            self.gpu_ring.set_value(None, "não suportado")
        self.ram_ring.set_value(
            snap.ram_percent, f"{snap.ram_used_gb:.1f}/{snap.ram_total_gb:.0f} GB"
        )
        if snap.disks:
            d = snap.disks[0]
            self.disk_ring.set_value(d.percent, f"{d.free_gb:.0f} GB livres")

        self.freq_tile.set_value(
            f"{snap.cpu_freq_mhz:.0f} MHz" if snap.cpu_freq_mhz else "—",
            f"máx {snap.cpu_freq_max_mhz/1000:.1f} GHz"
            if snap.cpu_freq_max_mhz else "",
        )
        if snap.cpu_freq_mhz:
            self.freq_spark.push(float(snap.cpu_freq_mhz))
        self.cputemp_tile.set_value(
            f"{snap.cpu_temp:.0f} °C" if snap.cpu_temp is not None else "N/D",
            "não suportado" if snap.cpu_temp is None else "temperatura",
        )
        if snap.cpu_temp is not None:
            self.cputemp_spark.push(float(snap.cpu_temp))
        self.gputemp_tile.set_value(
            f"{snap.gpu_temp:.0f} °C" if snap.gpu_temp is not None else "N/D",
            "não suportado" if snap.gpu_temp is None else "temperatura",
        )
        if snap.gpu_temp is not None:
            self.gputemp_spark.push(float(snap.gpu_temp))
        self.procs_tile.set_value(str(snap.proc_count))
        hours = int(snap.uptime_hours)
        self.uptime_tile.set_value(
            f"{hours}h {int((snap.uptime_hours - hours) * 60)}min"
        )

        self.core_bars.push(snap.cpu_per_core)
        self.freq_chart.push("MHz", snap.cpu_freq_mhz)
        self.disk_chart.push("Leitura", snap.disk_read_mbs)
        self.disk_chart.push("Escrita", snap.disk_write_mbs)
        self.net_chart.push("Download", snap.net_down_mbs)
        self.net_chart.push("Upload", snap.net_up_mbs)


def HardwareInfoPlaceholder():
    return HardwareMonitorTab._HWProxy()
