#!/usr/bin/env node
/**
 * Gera um único arquivo HTML com CSS e JS embutidos.
 *   node app/build.js   →  app/palco-conta.html
 */
const fs = require("node:fs");
const path = require("node:path");

const here = __dirname;
const read = (file) => fs.readFileSync(path.join(here, "assets", file), "utf8");

const template = fs.readFileSync(path.join(here, "template.html"), "utf8");
const parts = {
  CSS: read("styles.css").replace(/<\/style/gi, "<\\/style"),
  CORE: read("core.js"),
  HASH: read("hash.js"),
  AUTH: read("auth.js"),
  ICONS: read("icons.js"),
  APP: read("app.js"),
};

let html = template;
for (const [key, value] of Object.entries(parts)) {
  const marker = `/*__${key}__*/`;
  if (!html.includes(marker)) throw new Error("marcador ausente: " + marker);
  html = html.replace(marker, () => value.replace(/<\/script/gi, "<\\/script"));
}

const out = path.join(here, "palco-conta.html");
fs.writeFileSync(out, html, "utf8");
// cópia na raiz com o nome usado por hospedagens estáticas
fs.writeFileSync(path.join(here, "..", "index.html"), html, "utf8");
console.log(`[build] app/palco-conta.html + index.html — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
