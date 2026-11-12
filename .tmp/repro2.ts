import { getDashboard } from "../src/server/services/dashboard";
import { db } from "../src/server/db/client";
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

async function main() {
  // simula sessão: pega token do cookie? simplifica: roda dentro de withCompany da última loja
  const { runAsSystem, withCompany } = await import("../src/server/db/tenant");
  const comp = await runAsSystem(async () => {
    const r: any = await db.execute(sql`select company_id from sales order by number desc limit 1`);
    return r.rows[0].company_id;
  });
  // imprime os tokens de sessão válidos para essa loja (sem o token em si)
  const d = await withCompany(comp, () => getDashboard({ from: "2026-11-01", to: "2026-11-12" }));
  console.log("chart", d.chart.length, "mix", d.paymentMix.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
