import { sql } from "drizzle-orm";
import { db } from "../src/server/db/client";
import { runAsSystem, withCompany } from "../src/server/db/tenant";

async function main() {
  const comp = await runAsSystem(async () => {
    const r: any = await db.execute(sql`select company_id from sales order by number desc limit 1`);
    return r.rows[0].company_id;
  });
  await withCompany(comp, async () => {
    const r: any = await db.execute(sql`
      SELECT to_char(day, 'DD/MM') AS label, to_char(day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(total), 0)::text AS receita, COUNT(*)::int AS vendas
        FROM (
          SELECT date_trunc('day', completed_at AT TIME ZONE 'America/Sao_Paulo') AS day, total
            FROM sales
           WHERE status = 'COMPLETED'
             AND completed_at >= ${"2026-11-01T03:00:00.000Z"}::timestamptz
             AND completed_at < ${"2026-11-13T03:00:00.000Z"}::timestamptz
        ) t
       GROUP BY day ORDER BY day
    `);
    console.log("linhas:", r.rows);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
