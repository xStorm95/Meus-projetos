"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/form";

/**
 * Importação de clientes por planilha.
 *
 * Um clique: escolher o arquivo `.csv` (ou arrastar) e importar. O modelo já
 * vem preenchido com um exemplo e pode ser baixado para editar no Excel.
 * O servidor ignora documento repetido e devolve quantas linhas entraram,
 * quantas foram ignoradas e os avisos por linha.
 */
const MODELO = `nome;documento;telefone;whatsapp;email;nascimento;cidade;uf;endereco;numero;bairro;cep;limite;observacoes
Maria Silva;12345678909;33999990001;33999990001;maria@exemplo.com;31/12/1990;Ipatinga;MG;Rua das Flores;120;Centro;35160000;500,00;Prefere atendimento por WhatsApp
João Souza;;33999990002;33999990002;joao@exemplo.com;05/06/1985;Ipatinga;MG;Av. Brasil;45;Bela Vista;35162000;0;`;

type Resultado = {
  created: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
  totalErrors: number;
  semConsentimento: number;
};

export function ImportCustomersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [csv, setCsv] = React.useState("");
  const [carregando, setCarregando] = React.useState(false);
  const [resultado, setResultado] = React.useState<Resultado | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const linhas = csv.trim() ? csv.trim().split(/\r?\n/).length - 1 : 0;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function lerArquivo(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo maior que 2 MB. Divida a planilha em partes.");
      return;
    }
    const texto = await file.text();
    setCsv(texto);
    setResultado(null);
  }

  function baixarModelo() {
    // BOM para abrir certo no Excel pt-BR.
    const blob = new Blob(["\uFEFF" + MODELO], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-clientes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importar() {
    if (!csv.trim()) return toast.error("Escolha um arquivo ou cole o conteúdo.");
    setCarregando(true);
    try {
      const r = await api.post<Resultado>("/api/customers/import", { csv });
      setResultado(r);
      if (r.created > 0) {
        toast.success(`${r.created} cliente(s) importado(s).`);
        router.refresh();
      } else {
        toast.warning("Nenhum cliente novo foi importado.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCarregando(false);
    }
  }

  function fechar() {
    setCsv("");
    setResultado(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-clientes-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <div>
            <h2 id="import-clientes-titulo" className="text-sm font-semibold">
              Importar clientes
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Planilha CSV com uma linha por cliente. Nada é duplicado: documento repetido é
              ignorado.
            </p>
          </div>
          <button
            onClick={fechar}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* Passo 1 — arquivo */}
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-default)] bg-[var(--bg-muted)]/40 px-4 py-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) void lerArquivo(file);
            }}
          >
            <FileUp className="h-7 w-7 text-[var(--text-muted)]" />
            <p className="text-sm font-medium">Arraste o arquivo .csv aqui</p>
            <p className="text-[11px] text-[var(--text-muted)]">ou selecione no computador (máx. 2 MB)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void lerArquivo(file);
              }}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                leftIcon={<Upload className="h-3.5 w-3.5" />}
              >
                Selecionar arquivo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={baixarModelo}
                leftIcon={<Download className="h-3.5 w-3.5" />}
              >
                Baixar modelo
              </Button>
            </div>
          </div>

          {/* Passo 2 — colunas */}
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-muted)]/40 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
              Colunas aceitas (cabeçalho na primeira linha)
            </p>
            <p className="mt-1 font-mono text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              nome; documento; telefone; whatsapp; email; nascimento; cidade; uf; endereco;
              numero; bairro; cep; limite; observacoes
            </p>
            <p className="mt-1 text-[10.5px] text-[var(--text-muted)]">
              Aceita <strong>;</strong> ou <strong>,</strong> como separador. Datas em
              DD/MM/AAAA. Limite como <strong>1.500,00</strong>. Por LGPD, a importação{" "}
              <strong>não</strong> presume consentimento de marketing.
            </p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="label">Conteúdo do arquivo</p>
              <span className="text-[10px] text-[var(--text-muted)]">
                {linhas > 0 ? `${linhas} linha(s) de dados` : "vazio"}
              </span>
            </div>
            <Textarea
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResultado(null);
              }}
              rows={7}
              className="font-mono text-[11px]"
              placeholder={MODELO}
            />
          </div>

          {resultado && (
            <div className="space-y-2 rounded-xl border border-[var(--border-default)] p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                <p className="text-xs font-semibold">Resultado</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Importados", v: resultado.created },
                  { l: "Ignorados (duplicados)", v: resultado.skipped },
                  { l: "Avisos", v: resultado.totalErrors },
                ].map((k) => (
                  <div key={k.l} className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      {k.l}
                    </p>
                    <p className="text-base font-bold tabular-nums">{k.v}</p>
                  </div>
                ))}
              </div>
              {resultado.semConsentimento > 0 && (
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  {resultado.semConsentimento} cliente(s) entraram <strong>sem consentimento
                  de marketing</strong> registrado — peça a autorização antes de enviar
                  campanhas.
                </p>
              )}
              {resultado.errors.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--bg-muted)] p-2">
                  {resultado.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-[var(--text-secondary)]">
                      <Badge tone="warning">linha {e.line}</Badge>{" "}
                      <AlertTriangle className="inline h-3 w-3 text-[var(--warning)]" /> {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-default)] px-5 py-3">
          <Button variant="ghost" size="sm" onClick={fechar}>
            {resultado ? "Fechar" : "Cancelar"}
          </Button>
          <div className="flex gap-2">
            {csv && !resultado && (
              <Button variant="outline" size="sm" onClick={() => setCsv("")}>
                Limpar
              </Button>
            )}
            <Button
              size="sm"
              loading={carregando}
              disabled={!csv.trim()}
              onClick={() => void importar()}
            >
              {resultado ? "Importar novamente" : "Importar clientes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
