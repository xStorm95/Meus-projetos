import { getDashboard } from "../src/server/services/dashboard";
import { adminActor, inTestCompany } from "../tests/helpers";
import "../tests/helpers";

async function main() {
  const d = await inTestCompany(async () => getDashboard({ from: "2026-11-01", to: "2026-11-12" }));
  console.log("revenue", d.current.revenue, "chart", JSON.stringify(d.chart), "mix", d.paymentMix.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
