"use client";

import * as React from "react";
import { Check, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { gerarQr } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Desenho do QR do Pix.
 *
 * A matriz vem de `@/lib/qr` (gerada no cliente, sem rede). Duas saídas:
 *  - SVG na tela, para o cliente apontar a câmera;
 *  - "copia e cola" com um toque, que é como a maioria paga quando está no
 *    próprio celular.
 */
export function PixQr({
  payload,
  tamanho = 200,
  className,
  mostrarCopiaECola = true,
}: {
  payload: string;
  tamanho?: number;
  className?: string;
  mostrarCopiaECola?: boolean;
}) {
  const [copiado, setCopiado] = React.useState(false);

  const { caminho, modulos } = React.useMemo(() => {
    const matriz = gerarQr(payload, "M");
    // Quiet zone de 4 módulos, como manda o padrão (sem ela muitos leitores falham).
    const quiet = 4;
    const total = matriz.length + quiet * 2;
    let d = "";
    matriz.forEach((linha, y) => {
      linha.forEach((escuro, x) => {
        if (escuro) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      });
    });
    return { caminho: d, modulos: total };
  }, [payload]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      toast.success("Código Pix copiado.");
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  function baixar() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modulos} ${modulos}" width="600" height="600" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${caminho}" fill="#000"/></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "pix.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div
        className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5"
        style={{ width: tamanho, height: tamanho }}
      >
        <svg
          viewBox={`0 0 ${modulos} ${modulos}`}
          width="100%"
          height="100%"
          shapeRendering="crispEdges"
          role="img"
          aria-label="QR Code para pagamento via Pix"
        >
          <rect width="100%" height="100%" fill="#fff" />
          <path d={caminho} fill="#000" />
        </svg>
      </div>

      {mostrarCopiaECola && (
        <div className="w-full space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => void copiar()}
              leftIcon={copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            >
              {copiado ? "Copiado" : "Copiar código Pix"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={baixar}
              aria-label="Baixar QR em SVG"
              title="Baixar QR em SVG"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-[var(--text-muted)]">
            Aponte a câmera do banco ou use o copia e cola · valor já incluído
          </p>
        </div>
      )}
    </div>
  );
}
