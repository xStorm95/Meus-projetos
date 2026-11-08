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
  // Fontes embutidas (subset em base64) — geradas por `node web/fonts.js`.
  const fontsFile = path.join(SRC, "fonts.css");
  const fonts = fs.existsSync(fontsFile) ? fs.readFileSync(fontsFile, "utf8") : "";
  const parts = {
    FONTS: fonts,
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
    const safe = key === "CSS" || key === "FONTS" ? value : value.replace(/<\/script/gi, "<\\/script");
    html = html.replace(marker, () => safe);
  }

  fs.mkdirSync(DIST, { recursive: true });
  const outFile = path.join(DIST, "palco.html");
  fs.writeFileSync(outFile, html, "utf8");
  fs.writeFileSync(path.join(ROOT, "palco.html"), html, "utf8");

  // Arquivo pronto para o usuário: um único HTML, abre com dois cliques.
  fs.writeFileSync(path.join(ROOT, "..", "Passarela-da-Moda.html"), html, "utf8");
  console.log("[build] Passarela-da-Moda.html (raiz do repositório)");

  // Cópia publicada na página do GitHub Pages (docs/).
  const docsDir = path.join(ROOT, "..", "docs");
  if (fs.existsSync(docsDir)) {
    fs.writeFileSync(path.join(docsDir, "Passarela-da-Moda.html"), html, "utf8");
    console.log("[build] docs/Passarela-da-Moda.html (página de download)");
  }

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
  console.log(`[build] dist/palco.html — ${kb} KB (arquivo único, offline)`);
}

main();
