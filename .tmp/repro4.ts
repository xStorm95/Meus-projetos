import { sql } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { runAsSystem, withCompany } from "../src/server/db/tenant";

async function main() {
  const comp = await runAsSystem(async () => {
    const r: any = await db.execute(sql`select company_id from sales order by number desc limit 1`);
    return r.rows[0].company_id;
  });
  await withCompany(comp, async () => {
    // A) db.execute direto
    const a: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM (
        SELECT date_trunc('day', completed_at AT TIME ZONE 'America/Sao_Paulo') AS day, total
          FROM sales WHERE status = 'COMPLETED'
           AND completed_at >= ${"2026-11-01T03:00:00.000Z"}::timestamptz
           AND completed_at < ${"2026-11-13T03:00:00.000Z"}::timestamptz
      ) t GROUP BY day`);
    console.log("A db.execute (subquery+group by):", a.rows);
    // B) sem group by
    const b: any = await db.execute(sql`
      SELECT count(*)::int AS n FROM sales
       WHERE status = 'COMPLETED'
         AND completed_at >= ${"2026-11-01T03:00:00.000Z"}::timestamptz
         AND completed_at < ${"2026-11-13T03:00:00.000Z"}::timestamptz`);
    console.log("B simples:", b.rows);
    // C) drizzle select
    const { sales } = await import("../src/server/db/schema");
    const c = await db.select({ n: sql<number>`count(*)::int` }).from(sales);
    console.log("C select:", c);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
