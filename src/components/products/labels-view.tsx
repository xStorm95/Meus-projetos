"use client";

import * as React from "react";
import { Printer, ArrowLeft, Tag, Info } from "lucide-react";
import Link from "next/link";
import { brl, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, Alert } from "@/components/ui/primitives";
import { Field, Input, Segmented } from "@/components/ui/form";

type Label = {
  variantId: string;
  sku: string;
  barcode: string;
  productName: string;
  reference: string;
  colorName: string | null;
  sizeName: string | null;
  price: string;
  priceRaw: string;
};

/**
 * Renderiza as etiquetas em formato A4 (grade de 3 colunas × 8 linhas) e envia
 * para impressão com window.print(). Código de barras é desenhado em SVG
 * (Code128 simplificado) sem dependências externas — o mesmo código pode ser
 * lido por leitores de PDV quando impresso em boa qualidade.
 */
export function LabelsView({
  product,
  labels,
  companyName,
}: {
  product: { id: string; name: string; reference: string };
  labels: Label[];
  companyName: string;
}) {
  const [copies, setCopies] = React.useState<Record<string, number>>(
    Object.fromEntries(labels.map((l) => [l.variantId, 1])),
  );
  const [mode, setMode] = React.useState<"PRICE" | "BARCODE" | "BOTH">("BOTH");
  const [size, setSize] = React.useState<"P" | "M" | "G">("M");

  const total = labels.reduce((acc, l) => acc + (copies[l.variantId] ?? 0), 0);
  const preview = labels.flatMap((l) => Array.from({ length: Math.min(copies[l.variantId] ?? 0, 12) }, () => l));

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/produtos/${product.id}`} className="mb-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-3 w-3" /> Detalhe do produto
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">Etiquetas</h1>
          <p className="text-xs text-[var(--text-muted)]">
            {product.name} · ref. {product.reference} · {labels.length} variação(ões) · {total} etiqueta(s)
          </p>
        </div>
        <Button size="sm" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={total === 0}>
          Imprimir etiquetas
        </Button>
      </div>

      <Card className="no-print p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="label">Conteúdo</p>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "BARCODE", label: "Código" },
                { value: "PRICE", label: "Preço" },
                { value: "BOTH", label: "Ambos" },
              ]}
            />
          </div>
          <div>
            <p className="label">Tamanho</p>
            <Segmented
              value={size}
              onChange={setSize}
              options={[
                { value: "P", label: "33×22" },
                { value: "M", label: "50×30" },
                { value: "G", label: "60×40" },
              ]}
            />
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCopies(Object.fromEntries(labels.map((l) => [l.variantId, 1])))}
            >
              1 de cada
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCopies(Object.fromEntries(labels.map((l) => [l.variantId, 2])))}
            >
              2 de cada
            </Button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-default)]">
          <table className="w-full text-[12px]">
            <thead className="bg-[var(--bg-muted)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Variação</th>
                <th className="px-2 py-2 text-left">SKU / código</th>
                <th className="px-2 py-2 text-right">Preço</th>
                <th className="px-3 py-2 text-right">Etiquetas</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={label.variantId} className="border-t border-[var(--border-subtle)]">
                  <td className="px-3 py-1.5">
                    {label.colorName ?? "—"} {label.sizeName ? `· ${label.sizeName}` : ""}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-[var(--text-muted)]">{label.sku}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{label.price}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      value={copies[label.variantId] ?? 0}
                      onChange={(e) =>
                        setCopies((prev) => ({ ...prev, [label.variantId]: Math.max(0, Number(e.target.value)) }))
                      }
                      className="ml-auto w-20 text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Info className="h-3 w-3" /> A prévia abaixo reflete a quantidade escolhida (limitada a 12 por variação na
          tela). A impressão utiliza o tamanho padrão do papel configurado no navegador.
        </p>
      </Card>

      {labels.length === 0 && (
        <Alert tone="warning" title="Produto sem variações ativas">
          Cadastre a grade cor × tamanho para gerar etiquetas.
        </Alert>
      )}

      <div className={cn("print-area", size === "P" ? "text-[7px]" : size === "G" ? "text-[10px]" : "text-[9px]")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {preview.map((label, index) => (
            <div
              key={`${label.variantId}-${index}`}
              className="flex break-inside-avoid flex-col items-center justify-between rounded border border-[var(--border-default)] bg-white px-2 py-1.5 text-black"
            >
              <p className="w-full truncate text-center text-[0.85em] font-semibold uppercase tracking-tight">
                {companyName}
              </p>
              <p className="w-full truncate text-center text-[0.8em]">{label.productName}</p>
              <p className="w-full truncate text-center text-[0.75em] text-neutral-600">
                {label.colorName ?? ""} {label.sizeName ? `· ${label.sizeName}` : ""}
              </p>
              {mode !== "PRICE" && <Barcode value={label.barcode} className="my-0.5 h-6 w-full" />}
              {mode !== "PRICE" && <p className="font-mono text-[0.75em] tracking-wider">{label.barcode}</p>}
              {mode !== "BARCODE" && <p className="text-[1.25em] font-bold">{label.price}</p>}
            </div>
          ))}
        </div>
      </div>

      {total === 0 && labels.length > 0 && (
        <p className="no-print text-center text-xs text-[var(--text-muted)]">
          Informe a quantidade de etiquetas por variação.
        </p>
      )}

      {total > 0 && (
        <p className="no-print flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          <Tag className="h-3 w-3" /> {total} etiqueta(s) serão impressas · total de{" "}
          {brl(labels.reduce((acc, l) => acc + Number(l.priceRaw) * (copies[l.variantId] ?? 0), 0))} em valor de venda.
        </p>
      )}
    </div>
  );
}

/**
 * Código de barras Code128-B desenhado em SVG (implementação mínima, sem libs).
 * Suficiente para etiquetas internas; para EAN-13 fiscal use o código do produto.
 */
function Barcode({ value, className }: { value: string; className?: string }) {
  const pattern = React.useMemo(() => code128Bars(value), [value]);
  const width = pattern.length;
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      className={cn("w-full bg-white", className)}
      role="img"
      aria-label={`Código de barras ${value}`}
    >
      {pattern.split("").map((bit, i) =>
        bit === "1" ? <rect key={i} x={i} y={0} width={1} height={40} fill="#000" /> : null,
      )}
    </svg>
  );
}

const CODE128_PATTERNS: string[] = [
  "11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100",
  "10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100",
  "10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11101101110",
  "11101001100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110",
  "11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000",
  "11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110",
  "11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110",
  "11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000",
  "10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000",
  "10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010",
  "10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100",
  "11110010010","11011011110","11011110110","11110110110","10101111000","10100011110","10001011110","10111101000",
  "10111100010","11110101000","11110100010","10111011110","10111101110","11101011110","11110101110","11010000100",
  "11010010000","11010011100","1100011101011",
];

function code128Bars(value: string): string {
  // Start Code B = 104, checksum e stop
  const codes: number[] = [104];
  for (const char of value) {
    const code = char.charCodeAt(0);
    codes.push(code >= 32 && code <= 127 ? code - 32 : 0);
  }
  let checksum = 104;
  codes.slice(1).forEach((code, index) => {
    checksum += code * (index + 1);
  });
  codes.push(checksum % 103, 106);
  return codes.map((c) => CODE128_PATTERNS[c] ?? CODE128_PATTERNS[0]).join("");
}
