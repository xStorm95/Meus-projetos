"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[erro na interface]", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg-app)] px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">Ocorreu um erro inesperado</h1>
      <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">
        Não foi possível concluir a operação. Seus dados não foram alterados. Tente novamente — se o
        problema persistir, contate o administrador do sistema.
      </p>
      {error.digest && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">Código do erro: {error.digest}</p>
      )}
      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)]"
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
        <a
          href="/dashboard"
          className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-medium"
        >
          Ir ao dashboard
        </a>
      </div>
    </div>
  );
}
