#!/usr/bin/env node
/**
 * Empacota o app em UM único arquivo HTML (CSS e JS embutidos).
 * Funciona abrindo o arquivo direto (file://) e em qualquer hospedagem estática.
 *
 *   node web/build.js
 *   → dist/palco.html  (e uma cópia em web/palco.html)
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

function read(file) {
  return fs.readFileSync(path.join(SRC, file), "utf8");
}

/** Remove a repetição de "use strict"/header para economizar bytes no bundle. */
function wrapIIFE(code) {
  return code.trim();
}

function main() {
  const template = read("template.html");
  const parts = {
    CSS: read("styles.css"),
    CORE: wrapIIFE(read("core.js")),
    HASH: wrapIIFE(read("hash.js")),
    DB: wrapIIFE(read("db.js")),
    STORE: wrapIIFE(read("store.js")),
    ICONS: wrapIIFE(read("icons.js")),
    UI: wrapIIFE(read("ui.js")),
    APP: wrapIIFE(read("app.js")),
  };

  // Fecha comentários de bloco que poderiam quebrar o HTML
  parts.CSS = parts.CSS.replace(/<\/style/gi, "<\\/style");

  let html = template;
  for (const [key, value] of Object.entries(parts)) {
    const marker = `/*__${key}__*/`;
    if (!html.includes(marker)) throw new Error(`Marcador ausente no template: ${marker}`);
    const safe = key === "CSS" ? value : value.replace(/<\/script/gi, "<\\/script");
    html = html.replace(marker, () => safe);
  }

  fs.mkdirSync(DIST, { recursive: true });
  const outFile = path.join(DIST, "palco.html");
  fs.writeFileSync(outFile, html, "utf8");
  fs.writeFileSync(path.join(ROOT, "palco.html"), html, "utf8");

  // Cópia servida pelo Next (cloud/public/palco.html) — é o que a Vercel entrega em /app.
  const cloudPublic = path.join(ROOT, "..", "cloud", "public");
  if (fs.existsSync(path.join(ROOT, "..", "cloud"))) {
    fs.mkdirSync(cloudPublic, { recursive: true });
    fs.writeFileSync(path.join(cloudPublic, "palco.html"), html, "utf8");
    console.log("[build] cloud/public/palco.html atualizado");
  }

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
  console.log(`[build] dist/palco.html — ${kb} KB (arquivo único, offline)`);
}

main();
