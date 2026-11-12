"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, FileUp, Upload, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, downloadFile } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, Alert, Badge } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/form";

const TEMPLATE = `nome;referencia;categoria;marca;fornecedor;cor;tamanho;custo;preco;estoque;codigo_barras
Vestido Midi Canelado;VESTMIDI;Vestidos;Ateliê Aurora;Confecções Bella Moda;Preto;P;45,00;149,90;3;7891000000011
Vestido Midi Canelado;VESTMIDI;Vestidos;Ateliê Aurora;Confecções Bella Moda;Preto;M;45,00;149,90;4;7891000000012
Vestido Midi Canelado;VESTMIDI;Vestidos;Ateliê Aurora;Confecções Bella Moda;Vinho;M;45,00;149,90;2;7891000000013
Blusa Cropped Tricot;BLUSCROP;Croppeds;Ateliê Aurora;;Off-white;Único;22,00;79,90;6;7891000000021`;

type Result = {
  createdProducts: number;
  createdVariants: number;
  updatedVariants: number;
  groups: number;
  errors: Array<{ line: number; message: string }>;
};

export function ImportView({ canImport }: { canImport: boolean }) {
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const lines = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) return toast.error("Arquivo maior que 2 MB.");
    const text = await file.text();
    setCsv(text);
    setResult(null);
  }

  async function submit() {
    if (!csv.trim()) return toast.error("Envie ou cole o conteúdo CSV.");
    setLoading(true);
    try {
      const data = await api.post<Result>("/api/products/import", { csv });
      setResult(data);
      toast.success(
        `${data.createdProducts} produto(s) criado(s), ${data.createdVariants} variação(ões) nova(s), ${data.updatedVariants} atualizada(s).`,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/produtos" className="mb-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <ArrowLeft className="h-3 w-3" /> Produtos
          </Link>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Importar produtos
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            Planilha CSV com uma linha por variação (grade cor × tamanho).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download className="h-3.5 w-3.5" />}
            onClick={() => void downloadFile("/api/products/export", { format: "csv" }).catch((e) => toast.error(errorMessage(e)))}
          >
            Exportar catálogo atual
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileText className="h-3.5 w-3.5" />}
            onClick={() => {
              const blob = new Blob([`\uFEFF${TEMPLATE}`], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "modelo-importacao-produtos.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Baixar modelo
          </Button>
        </div>
      </div>

      <Alert tone="info" title="Como funciona a importação">
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12px]">
          <li>Cada linha representa uma variação (cor × tamanho). Linhas com a mesma referência formam a grade.</li>
          <li>Produtos com referência já existente têm preço e custo atualizados (nada é duplicado).</li>
          <li>Categoria, marca, cor, tamanho e fornecedor precisam existir no cadastro — nomes desconhecidos são ignorados com aviso.</li>
          <li>Use ponto ou vírgula decimal; valores monetários em reais.</li>
        </ul>
      </Alert>

      <Card className="space-y-3 p-4">
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-muted)]/40 px-4 py-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <FileUp className="h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-sm font-medium">Arraste o arquivo .csv aqui</p>
          <p className="text-[11px] text-[var(--text-muted)]">ou selecione no seu computador (máx. 2 MB)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} leftIcon={<Upload className="h-3.5 w-3.5" />}>
            Selecionar arquivo
          </Button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="label">Conteúdo do arquivo</p>
            <span className="text-[10px] text-[var(--text-muted)]">{lines > 0 ? `${lines} linha(s) de dados` : "vazio"}</span>
          </div>
          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setResult(null);
            }}
            rows={10}
            className="font-mono text-[11px]"
            placeholder={TEMPLATE}
          />
        </div>

        {!canImport && (
          <Alert tone="warning">Seu perfil não tem permissão para importar produtos.</Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { setCsv(""); setResult(null); }}>
            Limpar
          </Button>
          <Button size="sm" loading={loading} disabled={!canImport || !csv.trim()} onClick={() => void submit()}>
            Importar produtos
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
            <h2 className="text-sm font-semibold">Importação concluída</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { label: "Produtos criados", value: result.createdProducts },
              { label: "Variações novas", value: result.createdVariants },
              { label: "Variações atualizadas", value: result.updatedVariants },
              { label: "Grupos (referências)", value: result.groups },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg bg-[var(--bg-muted)] px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{kpi.label}</p>
                <p className="text-lg font-bold tabular-nums">{kpi.value}</p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--warning)]">
                <AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} aviso(s)
              </p>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-[var(--bg-muted)] p-2">
                {result.errors.map((error, i) => (
                  <p key={i} className="text-[11px] text-[var(--text-secondary)]">
                    <Badge tone="warning">linha {error.line}</Badge> {error.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setCsv(""); setResult(null); }}>
              Importar outro arquivo
            </Button>
            <Link href="/produtos">
              <Button size="sm">Ver produtos</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
