#!/usr/bin/env node
/**
 * Gera src/fonts.css com as fontes EMBUTIDAS em base64 (subset).
 * Assim a tipografia é sempre a mesma em qualquer computador, mesmo
 * sem internet — o arquivo HTML continua funcionando sozinho.
 *
 *   node web/fonts.js
 */
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "src", "fonts");
const read = (file) => fs.readFileSync(path.join(DIR, file)).toString("base64");

function main() {
  const sections = [];

  if (fs.existsSync(path.join(DIR, "cormorant.woff2"))) {
    sections.push(`@font-face {
  font-family: "Passarela Display";
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${read("cormorant.woff2")}) format("woff2");
}`);
  }

  if (fs.existsSync(path.join(DIR, "inter.woff2"))) {
    sections.push(`@font-face {
  font-family: "Passarela Sans";
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url(data:font/woff2;base64,${read("inter.woff2")}) format("woff2");
}`);
  }

  const header = "/* FONTES EMBUTIDAS — gerado por web/fonts.js, não editar à mão. */\n\n";
  fs.writeFileSync(path.join(__dirname, "src", "fonts.css"), header + sections.join("\n\n") + "\n", "utf8");
  console.log("[fonts] src/fonts.css — " + sections.length + " fonte(s) embutida(s)");
}

main();
