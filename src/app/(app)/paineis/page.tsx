import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { withCompany } from "@/server/db/tenant";
import { resolvePeriod, type PeriodPreset } from "@/server/lib/dates";
import { curvaAbcClientes, curvaAbcProdutos, metasDoMes } from "@/server/services/dashboard";
import {
  comparativoLojas,
  periodoPadraoComparativo,
  podeVerComparativoLojas,
} from "@/server/services/platform";
import { InsightsView } from "./insights-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painéis" };

export default async function PaineisPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("reports.view") && !user.permissions.includes("sales.view")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const preset = (params.period as PeriodPreset) || "thisMonth";
  const period = resolvePeriod(preset, params.from, params.to);

  // A loja entra explicitamente no contexto (layout e página são contextos
  // separados no App Router) — ver comentário em `dashboard/page.tsx`.
  const [curvaProdutos, curvaClientes, metas] = await withCompany(user.companyId, () =>
    Promise.all([
      curvaAbcProdutos(period.from, period.to),
      curvaAbcClientes(period.from, period.to),
      metasDoMes(),
    ]),
  );

  /*
   * Comparativo entre lojas roda FORA do contexto de loja (é a única forma de
   * ler mais de uma). Por isso a autorização vem antes: só administrador da
   * plataforma, e a checagem de e-mail é feita no servidor, nunca no cliente.
   */
  const podeVerLojas = await podeVerComparativoLojas({ id: user.id, email: user.email });
  let lojas = null;
  if (podeVerLojas) {
    const janela = periodoPadraoComparativo();
    lojas = await comparativoLojas(janela.from, janela.to);
  }

  return (
    <InsightsView
      curvaProdutos={curvaProdutos}
      curvaClientes={curvaClientes}
      metas={metas}
      lojas={lojas}
      podeVerLojas={podeVerLojas}
      periodLabel={period.label}
      periodFrom={period.from}
      periodTo={period.to}
    />
  );
}
