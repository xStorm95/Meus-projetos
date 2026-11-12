import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Boxes,
  Check,
  CreditCard,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Users,
  Wallet,
} from "lucide-react";
import { BRAND } from "@/config/brand";
import { OrionMark, OrionWordmark } from "@/components/brand/orion-mark";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.pitch,
};

/** Estrutura de dados da landing (SEO: também vira JSON-LD no rodapé). */
const RECURSOS = [
  {
    icon: <ShoppingBag className="h-5 w-5" />,
    titulo: "PDV rápido",
    texto: "Venda em poucos toques, com leitor de código, desconto com limite por vendedor e comprovante.",
  },
  {
    icon: <Boxes className="h-5 w-5" />,
    titulo: "Estoque com grade",
    texto: "Cor e tamanho na mesma tela, mínimo por variação, entrada por compra e alerta de reposição.",
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    titulo: "Caixa que fecha",
    texto: "Abertura, sangria, suprimento, conferência de cédulas e fechamento com diferença calculada.",
  },
  {
    icon: <CreditCard className="h-5 w-5" />,
    titulo: "Crediário próprio",
    texto: "Parcelamento com juros e multa, controle de atraso e cobrança pelo WhatsApp.",
  },
  {
    icon: <Banknote className="h-5 w-5" />,
    titulo: "Financeiro completo",
    texto: "Contas a pagar e a receber, DRE gerencial, centros de custo e fluxo de caixa.",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    titulo: "Relatórios de verdade",
    texto: "Vinte e cinco relatórios prontos, com exportação em CSV e Excel.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    titulo: "Equipe com permissões",
    texto: "Cada pessoa vê só o que precisa; tudo o que é sensível fica registrado na auditoria.",
  },
  {
    icon: <Smartphone className="h-5 w-5" />,
    titulo: "Funciona no celular",
    texto: "Abre no navegador do celular e pode ser instalado na tela inicial como aplicativo.",
  },
];

const NUMEROS = [
  { valor: "25", rotulo: "relatórios prontos" },
  { valor: "1", rotulo: "loja por conta, com dados isolados" },
  { valor: "0", rotulo: "planilhas para manter" },
];

export default function LandingPage() {
  const ano = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- Cabeçalho ---------- */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-default)] bg-[var(--bg-app)]/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label={BRAND.fullName}>
            <OrionWordmark size="md" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-[var(--text-secondary)] md:flex">
            <a href="#recursos" className="transition-colors hover:text-[var(--text-primary)]">
              Recursos
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-[var(--text-primary)]">
              Como funciona
            </a>
            <a href="#planos" className="transition-colors hover:text-[var(--text-primary)]">
              Planos
            </a>
            <Link href="/login" className="transition-colors hover:text-[var(--text-primary)]">
              Entrar
            </Link>
          </nav>
          <Link
            href="/cadastro"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition-transform hover:-translate-y-0.5"
          >
            Testar grátis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 0%, rgba(125,179,255,0.16) 0%, rgba(11,11,15,0) 70%)",
            }}
          />
          <div className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                <OrionMark size={14} withGlow />
                Para lojas de roupa, calçados e acessórios
              </span>

              <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
                Sua loja inteira
                <span className="block text-[var(--accent)]">em um só lugar</span>
              </h1>

              <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-secondary)] sm:text-lg">
                {BRAND.pitch} Vendas, estoque com grade, caixa, crediário e financeiro —
                sem planilha paralela e sem retrabalho.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/cadastro"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-7 text-base font-semibold text-[var(--accent-contrast)] transition-transform hover:-translate-y-0.5 sm:w-auto"
                >
                  Testar grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={BRAND.contact.whatsapp || "#planos"}
                  target={BRAND.contact.whatsapp ? "_blank" : undefined}
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-7 text-base font-medium transition-colors hover:bg-[var(--bg-surface)] sm:w-auto"
                >
                  Falar no WhatsApp
                </a>
              </div>

              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Sem cartão de crédito. Sua loja fica pronta em menos de dois minutos.
              </p>
            </div>

            {/* Números */}
            <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
              {NUMEROS.map((n) => (
                <div
                  key={n.rotulo}
                  className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-4 text-center"
                >
                  <p className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--accent)]">
                    {n.valor}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{n.rotulo}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Recursos ---------- */}
        <section id="recursos" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Recursos
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              O que a loja precisa, sem o que ela não usa
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              Cada tela foi pensada para o balcão: poucos campos, atalhos de teclado e
              números que batem entre si.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RECURSOS.map((r) => (
              <article
                key={r.titulo}
                className="group rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--accent)]/50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  {r.icon}
                </span>
                <h3 className="mt-4 text-sm font-semibold">{r.titulo}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{r.texto}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- Como funciona ---------- */}
        <section
          id="como-funciona"
          className="scroll-mt-24 border-y border-[var(--border-default)] bg-[var(--bg-surface)]/50"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                  Como funciona
                </p>
                <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
                  Do cadastro à primeira venda em três passos
                </h2>
                <ol className="mt-8 space-y-5">
                  {[
                    {
                      t: "Crie a conta",
                      d: "Nome da loja, seu nome, e-mail e senha. Não pedimos cartão nem CNPJ para começar.",
                    },
                    {
                      t: "Cadastre o que você vende",
                      d: "Produto com grade de cor e tamanho, preço de custo e de venda. Dá para importar uma planilha.",
                    },
                    {
                      t: "Abra o caixa e venda",
                      d: "O PDV funciona no computador e no celular. No fim do dia, o fechamento é conferido pelo sistema.",
                    },
                  ].map((p, i) => (
                    <li key={p.t} className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{p.t}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">{p.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* “Print” ilustrativo, feito em HTML (não é imagem) */}
              <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-app)] p-4 shadow-2xl">
                <div className="flex items-center gap-1.5 pb-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#4ade80]/70" />
                  <span className="ml-3 text-[10px] text-[var(--text-muted)]">orion · dashboard</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: "Faturamento do mês", v: "R$ 18.420,00", d: "+12,4%", up: true },
                    { l: "Vendas", v: "143", d: "+8,1%", up: true },
                    { l: "Ticket médio", v: "R$ 128,81", d: "-2,3%", up: false },
                    { l: "Lucro estimado", v: "R$ 6.148,00", d: "+15,9%", up: true },
                  ].map((k) => (
                    <div
                      key={k.l}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3"
                    >
                      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{k.l}</p>
                      <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums">
                        {k.v}
                      </p>
                      <p
                        className={`text-[10px] font-semibold ${
                          k.up ? "text-[var(--success)]" : "text-[var(--danger)]"
                        }`}
                      >
                        {k.d}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                  <div className="flex items-end gap-1.5" aria-hidden>
                    {[38, 52, 44, 61, 55, 72, 64, 80, 58, 74, 68, 88].map((h, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-t bg-[var(--accent)]/70"
                        style={{ height: `${h * 0.6}px` }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                    Evolução do faturamento nos últimos 12 meses
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Planos (sem checkout) ---------- */}
        <section id="planos" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Planos
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              Comece grátis e decida depois
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              O cadastro é aberto e não há cobrança nesta página. Para contratar ou
              tirar dúvidas, fale com a gente pelo WhatsApp.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {[
              {
                nome: "Inicial",
                preco: "Grátis",
                detalhe: "para começar hoje",
                itens: [
                  "1 loja e 1 usuário",
                  "PDV, produtos com grade e estoque",
                  "Caixa com fechamento",
                  "Relatórios essenciais",
                ],
                destaque: false,
              },
              {
                nome: "Loja",
                preco: "R$ 89",
                detalhe: "por mês, por loja",
                itens: [
                  "Usuários ilimitados com permissões",
                  "Crediário e financeiro completo",
                  "25 relatórios com exportação",
                  "Auditoria de todas as ações",
                ],
                destaque: true,
              },
              {
                nome: "Rede",
                preco: "Fale com a gente",
                detalhe: "para mais de uma loja",
                itens: [
                  "Várias lojas com dados isolados",
                  "Painel comparativo entre lojas",
                  "Suporte prioritário",
                  "Treinamento da equipe",
                ],
                destaque: false,
              },
            ].map((p) => (
              <div
                key={p.nome}
                className={`relative rounded-2xl border bg-[var(--bg-surface)] p-6 ${
                  p.destaque
                    ? "border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]"
                    : "border-[var(--border-default)]"
                }`}
              >
                {p.destaque && (
                  <span className="absolute -top-3 left-6 rounded-full bg-[var(--accent)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-contrast)]">
                    Mais escolhido
                  </span>
                )}
                <p className="text-sm font-semibold">{p.nome}</p>
                <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums">
                  {p.preco}
                </p>
                <p className="text-xs text-[var(--text-muted)]">{p.detalhe}</p>
                <ul className="mt-5 space-y-2.5">
                  {p.itens.map((i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                      {i}
                    </li>
                  ))}
                </ul>
                <a
                  href={BRAND.contact.whatsapp || "#cadastro"}
                  className={`mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                    p.destaque
                      ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                      : "border border-[var(--border-strong)] hover:bg-[var(--bg-muted)]"
                  }`}
                >
                  {p.destaque ? "Testar grátis" : "Falar com a gente"}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11px] text-[var(--text-muted)]">
            Valores ilustrativos: a contratação é feita por conversa, não há pagamento
            online nesta página.
          </p>
        </section>

        {/* ---------- Segurança e LGPD ---------- */}
        <section id="lgpd" className="border-y border-[var(--border-default)] bg-[var(--bg-surface)]/50">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 lg:grid-cols-3">
            {[
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                t: "Seus dados são seus",
                d: "Cada loja tem um espaço isolado no banco. Nenhuma loja enxerga dado de outra — o isolamento é aplicado na camada de acesso, não por tela.",
              },
              {
                icon: <Lock className="h-5 w-5" />,
                t: "Senha e sessão protegidas",
                d: "Senha com hash, sessão por token opaco revogável e cookie inacessível ao JavaScript. Toda ação sensível fica na auditoria.",
              },
              {
                icon: <BadgeCheck className="h-5 w-5" />,
                t: "Conforme a LGPD",
                d: "Você pode exportar e apagar os dados da sua loja. Não usamos os dados dos seus clientes para nada além de operar o sistema.",
              },
            ].map((c) => (
              <div key={c.t}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  {c.icon}
                </span>
                <h3 className="mt-4 text-sm font-semibold">{c.t}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- CTA final ---------- */}
        <section id="cadastro" className="mx-auto w-full max-w-4xl scroll-mt-24 px-5 py-20 text-center">
          <OrionMark size={44} withGlow className="mx-auto text-[var(--accent)]" />
          <h2 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Abra a sua loja agora
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
            Crie a conta, cadastre um produto e faça a primeira venda. Leva menos tempo
            do que preparar uma planilha.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/cadastro"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-7 text-base font-semibold text-[var(--accent-contrast)] transition-transform hover:-translate-y-0.5 sm:w-auto"
            >
              Criar minha conta
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] px-7 text-base font-medium transition-colors hover:bg-[var(--bg-surface)] sm:w-auto"
            >
              Já tenho conta
            </Link>
          </div>
        </section>
      </main>

      {/* ---------- Rodapé ---------- */}
      <footer className="border-t border-[var(--border-default)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <OrionWordmark size="sm" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-[var(--text-muted)]">
              {BRAND.fullName} · {BRAND.tagline}. {BRAND.legal}.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-[var(--text-secondary)]">
            <Link href="/termos" className="hover:text-[var(--text-primary)]">
              Termos de uso
            </Link>
            <Link href="/privacidade" className="hover:text-[var(--text-primary)]">
              Privacidade
            </Link>
            <Link href="/login" className="hover:text-[var(--text-primary)]">
              Entrar
            </Link>
            <Link href="/cadastro" className="hover:text-[var(--text-primary)]">
              Criar conta
            </Link>
            <a href={`mailto:${BRAND.contact.email}`} className="hover:text-[var(--text-primary)]">
              {BRAND.contact.email}
            </a>
          </nav>
        </div>
        <div className="mx-auto w-full max-w-6xl px-5 pb-8">
          <p className="text-[11px] text-[var(--text-muted)]">
            © {ano} {BRAND.fullName}. Versão {BRAND.version}.
          </p>
        </div>
      </footer>

      {/* Dados estruturados (SEO) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: BRAND.fullName,
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description: BRAND.pitch,
            inLanguage: "pt-BR",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "BRL",
            },
          }),
        }}
      />
    </div>
  );
}
