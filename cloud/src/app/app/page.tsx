import fs from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Carrega o HTML do ERP gerado por `node web/build.js`. */
function loadAppHtml(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "palco.html"),
    path.join(process.cwd(), "..", "web", "palco.html"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const html = loadAppHtml();

  if (!html) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: 40, maxWidth: 620, margin: "0 auto" }}>
        <h1>App ainda não foi compilado</h1>
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          Rode <code>node web/build.js</code> na raiz do repositório para gerar{" "}
          <code>web/palco.html</code>, faça o commit e o deploy. Depois disso esta página passa a abrir o
          sistema.
        </p>
      </main>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
