import { getDashboard } from "../src/server/services/dashboard";
import { runWithCompany } from "../src/server/db/tenant";
import { db } from "../src/server/db/client";
import { sql } from "drizzle-orm";

async function main() {
  const { runAsSystem } = await import("../src/server/db/tenant");
  const comp = await runAsSystem(async () => {
    const rows: any = await db.execute(sql`select company_id from sales order by number desc limit 1`);
    return rows.rows[0].company_id;
  });
  const { withCompany } = await import("../src/server/db/tenant");
  await withCompany(comp, async () => {
    const d = await getDashboard({ from: "2026-11-01", to: "2026-11-12" });
    console.log("current", d.current);
    console.log("chart", d.chart);
    console.log("mix", d.paymentMix);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
