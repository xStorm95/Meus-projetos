import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg-app)] px-6 text-center">
      <p className="font-[family-name:var(--font-display)] text-6xl font-semibold text-[var(--accent)]">404</p>
      <h1 className="mt-3 text-lg font-semibold">Página não encontrada</h1>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        O endereço acessado não existe ou você não tem permissão para visualizá-lo.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)]"
      >
        Voltar ao dashboard
      </Link>
    </div>
  );
}
