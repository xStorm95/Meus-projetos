#!/usr/bin/env node
/**
 * Servidor de download da Passarela da Moda.
 *
 *   npm run web:serve   → http://localhost:8080
 *
 * Rotas:
 *   /            página com o botão de download
 *   /baixar      entrega o arquivo com Content-Disposition: attachment
 *   /programa    abre o programa direto no navegador
 *   /logo.svg    logo oficial
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "Passarela-da-Moda.html");
const LOGO = path.join(__dirname, "brand", "logo.svg");
const MARK = path.join(__dirname, "brand", "mark.svg");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";

const FILE_NAME = "Passarela-da-Moda.html";

function humanSize(bytes) {
  return (bytes / 1024).toFixed(0) + " KB";
}

function landing() {
  const size = fs.existsSync(FILE) ? humanSize(fs.statSync(FILE).size) : "—";
  const updated = fs.existsSync(FILE)
    ? new Date(fs.statSync(FILE).mtime).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baixar · Passarela da Moda</title>
<link rel="icon" href="/mark.svg">
<style>
  :root {
    --bg: #f7f3ea; --surface: #fffdf8; --ink: #211f1c; --soft: #5f5a51;
    --gold: #b08d3c; --gold-soft: #e8c766; --line: rgba(33,31,28,.12);
    --shadow: 0 24px 60px -28px rgba(33,31,28,.42), 0 2px 10px rgba(33,31,28,.06);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 28px 18px;
    background:
      radial-gradient(1200px 600px at 15% -10%, #f1e3bf 0%, transparent 60%),
      radial-gradient(900px 500px at 100% 0%, #efe6d3 0%, transparent 55%),
      var(--bg);
    font-family: "Inter", -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--ink);
  }
  .card {
    width: 100%; max-width: 640px; background: var(--surface); border: 1px solid var(--line);
    border-radius: 28px; box-shadow: var(--shadow); overflow: hidden;
    animation: up .6s cubic-bezier(.22,1,.36,1) both;
  }
  @keyframes up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  .top { padding: 34px 34px 0; text-align: center; }
  .top img { width: 132px; height: auto; display: block; margin: 0 auto 18px; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: clamp(26px, 4.4vw, 34px); margin: 0 0 8px; letter-spacing: -.01em; }
  .sub { margin: 0 auto; max-width: 44ch; color: var(--soft); font-size: 15px; line-height: 1.6; }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 20px 0 0; }
  .badge {
    font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line); color: var(--soft); background: #fff;
  }
  .badge.gold { color: #7a5f16; border-color: rgba(176,141,60,.35); background: rgba(232,199,102,.16); }
  .body { padding: 26px 34px 34px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 10px;
    width: 100%; padding: 17px 22px; border-radius: 16px; border: 0; cursor: pointer;
    font-size: 16px; font-weight: 700; text-decoration: none; color: #241a06;
    background: linear-gradient(135deg, #ecd292, #d9b45f 55%, #c39c46);
    box-shadow: 0 16px 30px -16px rgba(176,141,60,.85);
    transition: transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s;
  }
  .btn:hover { transform: translateY(-2px); box-shadow: 0 22px 38px -16px rgba(176,141,60,.95); }
  .btn:active { transform: translateY(0) scale(.99); }
  .btn.ghost {
    background: #fff; color: var(--ink); border: 1px solid var(--line); box-shadow: none;
    font-weight: 600; padding: 14px 20px; font-size: 14.5px;
  }
  .btn.ghost:hover { border-color: rgba(176,141,60,.5); box-shadow: 0 10px 24px -18px rgba(33,31,28,.5); }
  .meta { display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; margin: 14px 0 22px; font-size: 12.5px; color: #8b857a; }
  .meta b { color: var(--ink); font-weight: 600; }
  .steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .steps li { display: flex; gap: 12px; font-size: 14px; color: var(--soft); line-height: 1.5; }
  .steps .n {
    flex: none; width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center;
    background: rgba(232,199,102,.22); color: #7a5f16; font-weight: 700; font-size: 12px;
  }
  .steps b { color: var(--ink); }
  .note {
    margin-top: 22px; padding: 13px 15px; border-radius: 12px; font-size: 12.8px; line-height: 1.55;
    background: #fdf7e6; border: 1px solid rgba(176,141,60,.28); color: #6d5a25;
  }
  .foot { text-align: center; font-size: 11.5px; color: #9b9488; margin-top: 20px; }
  svg { flex: none; }
</style>
</head>
<body>
  <main class="card">
    <div class="top">
      <img src="/logo.svg" alt="Passarela da Moda">
      <h1>Passarela da Moda</h1>
      <p class="sub">Sistema de gestão da loja que roda no seu computador. Sem internet, sem instalação, sem login.</p>
      <div class="badges">
        <span class="badge gold">Offline</span>
        <span class="badge">Arquivo único</span>
        <span class="badge">Salva em arquivo</span>
        <span class="badge">Com fotos</span>
      </div>
    </div>

    <div class="body">
      <a class="btn" href="/baixar" download="${FILE_NAME}">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></svg>
        Baixar o programa
      </a>

      <div class="meta">
        <span><b>${FILE_NAME}</b></span>
        <span>${size}</span>
        <span>atualizado em ${updated}</span>
      </div>

      <a class="btn ghost" href="/programa" target="_blank" rel="noopener">
        Ou usar direto no navegador agora
      </a>

      <ol class="steps" style="margin-top:26px">
        <li><span class="n">1</span><span><b>Clique em “Baixar o programa”.</b> O arquivo <code>${FILE_NAME}</code> vai para a pasta Downloads.</span></li>
        <li><span class="n">2</span><span><b>Dê dois cliques no arquivo.</b> Ele abre no Chrome, Edge ou Opera — não precisa instalar nada.</span></li>
        <li><span class="n">3</span><span><b>Clique em “Escolher arquivo de dados”.</b> Escolha uma pasta (ex.: <i>Documentos\\Passarela</i>) e pronto: tudo passa a ser salvo nesse arquivo.</span></li>
      </ol>

      <div class="note">
        Para gravar direto no arquivo, use <b>Chrome, Edge ou Opera</b>. Em outros navegadores, o botão
        “Baixar arquivo manualmente” gera uma cópia completa dos dados (inclusive as fotos).
      </div>

      <p class="foot">Passarela da Moda · seus dados ficam só no seu computador</p>
    </div>
  </main>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  let route = url.pathname.replace(/\/+$/, "") || "/";

  if (route === "/" || route === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(landing());
  }

  // /arquivo — mesmo download, caminho curto para compartilhar como link.
  if (route === "/arquivo" || route === "/arquivo.html") route = "/baixar";

  if (route === "/baixar" || route === "/download") {
    if (!fs.existsSync(FILE)) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      return res.end("O programa ainda não foi gerado. Rode: npm run web:build");
    }
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${FILE_NAME}"`,
      "content-length": fs.statSync(FILE).size,
      "cache-control": "no-store",
    });
    return fs.createReadStream(FILE).pipe(res);
  }

  if (route === "/programa" || route === "/app") {
    if (!fs.existsSync(FILE)) {
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Rode npm run web:build");
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return fs.createReadStream(FILE).pipe(res);
  }

  if (route === "/logo.svg" || route === "/mark.svg") {
    const file = route === "/logo.svg" ? LOGO : MARK;
    res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=3600" });
    return fs.createReadStream(file).pipe(res);
  }

  res.writeHead(302, { location: "/" });
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(`[serve] Passarela da Moda em http://${HOST}:${PORT}`);
  console.log(`[serve] download: /baixar · programa: /programa`);
});
