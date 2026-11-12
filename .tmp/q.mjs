import pg from "pg";
const c = new pg.Client("postgresql://postgres:postgres@127.0.0.1:5432/orion");
await c.connect();
for (const q of process.argv.slice(2)) {
  const r = await c.query(q);
  console.log(JSON.stringify(r.rows, null, 1).slice(0, 2000));
}
await c.end();
