/**
 * Teste de navegador (jsdom) rodando o app/palco-conta.html de verdade.
 * Fluxo: login vazio → cadastro → perfil → foto → recarregar → conferir que a
 * foto e os dados continuaram salvos → sair → entrar de novo.
 *
 *   node app/tests/e2e.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "palco-conta.html"), "utf8");

let current = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(predicate, label, timeout = 8000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try {
      const value = predicate();
      if (value) return value;
    } catch (err) {
      lastErr = err;
    }
    await sleep(35);
  }
  throw new Error("Timeout aguardando: " + label + (lastErr ? " (" + lastErr.message + ")" : ""));
}

/** Abre a página, opcionalmente hidratando o localStorage salvo antes. */
async function open(storage) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    if (!/Not implemented/.test(e.message)) errors.push(e.message);
  });
  vc.on("error", (...args) => errors.push(args.join(" ")));

  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole: vc,
    resources: "usable",
  });
  const win = dom.window;

  // canvas não existe no jsdom: stub mínimo para o redimensionamento da foto
  win.HTMLCanvasElement.prototype.getContext = function () {
    return { fillRect() {}, drawImage() {}, imageSmoothingEnabled: true, imageSmoothingQuality: "high" };
  };
  win.HTMLCanvasElement.prototype.toDataURL = function () {
    return "data:image/jpeg;base64," + Buffer.from("foto-de-teste").toString("base64");
  };
  // FileReader fake para o upload simulado
  win.FileReader = class {
    readAsDataURL(file) {
      this.result = file.__dataUrl || "data:image/png;base64,iVBORw0KGgo=";
      setTimeout(() => this.onload && this.onload(), 0);
    }
  };
  Object.defineProperty(win.HTMLImageElement.prototype, "src", {
    set() {
      setTimeout(() => this.onload && this.onload(), 0);
    },
    get() {
      return "";
    },
  });

  if (storage) Object.entries(storage).forEach(([k, v]) => win.localStorage.setItem(k, v));

  await waitFor(() => win.document.querySelector("#form-login, #form-profile"), "app montado");
  current = win;
  return { win, errors };
}

function snapshot(win) {
  const out = {};
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    out[k] = win.localStorage.getItem(k);
  }
  return out;
}

function type(selector, value) {
  const input = current.document.querySelector(selector);
  assert.ok(input, "campo não encontrado: " + selector);
  input.value = value;
  input.dispatchEvent(new current.Event("input", { bubbles: true }));
  return input;
}

function submit(selector) {
  const form = current.document.querySelector(selector);
  assert.ok(form, "formulário não encontrado: " + selector);
  form.dispatchEvent(new current.Event("submit", { bubbles: true, cancelable: true }));
}

function click(selector) {
  const node = current.document.querySelector(selector);
  assert.ok(node, "elemento não encontrado: " + selector);
  node.dispatchEvent(new current.MouseEvent("click", { bubbles: true, cancelable: true }));
  return node;
}

const PHOTO = "data:image/jpeg;base64," + Buffer.from("foto-de-teste").toString("base64");

test("conta: cadastro, perfil, foto persistente e novo login", async () => {
  // ---------- 1. primeira visita: mostra login e avisa que não há conta ----------
  const first = await open();
  assert.ok(current.document.querySelector("#form-login"), "deve abrir na tela de login");
  assert.match(current.document.querySelector(".notice").textContent, /Nenhuma conta/i);
  assert.ok(current.document.querySelector('a[href="#cadastro"]'), "precisa ter link para criar conta");

  // validação visível antes de enviar
  submit("#form-login");
  await waitFor(() => current.document.querySelector('[data-error="email"]').textContent, "erro de e-mail vazio");

  // ---------- 2. cadastro ----------
  click('a[href="#cadastro"]');
  await waitFor(() => current.document.querySelector("#form-signup"), "tela de cadastro");

  type("#su-name", "Ana Beatriz Lopes");
  type("#su-email", "ana@palco.com");
  type("#su-phone", "31998877665");
  type("#su-document", "52998224725");
  type("#su-password", "Palco@2026");
  type("#su-password-confirm", "Palco@2026");

  await waitFor(
    () => current.document.querySelector("[data-strength]").dataset.score === "3" ||
          current.document.querySelector("[data-strength]").dataset.score === "4",
    "barra de força da senha",
  );
  await waitFor(() => current.document.querySelector("[data-email-check]").className.includes("ok"), "e-mail disponível");

  submit("#form-signup");
  await waitFor(() => current.document.querySelector("#form-profile"), "perfil após cadastro", 12000);

  const store = current.App.store();
  assert.equal(store.currentAccount().name, "Ana Beatriz Lopes");
  assert.equal(store.currentAccount().email, "ana@palco.com");
  assert.ok(store.getState().accounts[0].passwordHash.startsWith("pbkdf2$"));
  assert.match(current.document.querySelector(".hero h1").textContent, /Ana Beatriz Lopes/);

  // ---------- 3. perfil: editar dados ----------
  type("#pf-city", "Ipatinga");
  type("#pf-bio", "Dona da loja");
  submit("#form-profile");
  await waitFor(() => store.currentAccount().city === "Ipatinga", "cidade salva", 10000);

  // ---------- 4. foto ----------
  const file = { type: "image/jpeg", size: 1024, __dataUrl: PHOTO, name: "foto.jpg" };
  const input = current.document.querySelector("#photo-file");
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new current.Event("change", { bubbles: true }));

  await waitFor(() => current.document.querySelector("#photo-actions:not(.hidden)"), "prévia da foto");
  click("#photo-save");
  await waitFor(() => store.currentAccount().avatar === PHOTO, "foto gravada no perfil", 12000);
  await waitFor(() => current.document.querySelector(".hero .avatar img"), "foto visível no hero");

  // ---------- 5. "fechar o navegador e voltar" ----------
  const saved = snapshot(current);
  assert.ok(Object.keys(saved).some((k) => k.includes("accounts")), "contas no armazenamento");
  assert.ok(JSON.stringify(saved).includes("ana@palco.com"));
  assert.ok(!JSON.stringify(saved).includes("Palco@2026"), "senha em texto puro nunca é gravada");

  const reopened = await open(saved);
  await waitFor(() => current.document.querySelector("#form-profile"), "sessão restaurada", 12000);
  assert.equal(current.App.store().currentAccount().email, "ana@palco.com");
  assert.equal(current.App.store().currentAccount().avatar, PHOTO, "a foto precisa continuar salva");
  assert.equal(current.App.store().currentAccount().city, "Ipatinga");
  assert.ok(current.document.querySelector(".hero .avatar img"), "foto renderizada após reabrir");

  // ---------- 6. sair e entrar com a senha certa ----------
  click("#logout-btn");
  await waitFor(() => current.document.querySelector("#form-login"), "tela de login após sair");

  type("#login-email", "ana@palco.com");
  type("#login-password", "senha-errada");
  submit("#form-login");
  await waitFor(() => /incorret/i.test(current.document.querySelector('[data-error="password"]').textContent), "senha errada");

  type("#login-password", "Palco@2026");
  submit("#form-login");
  await waitFor(() => current.document.querySelector("#form-profile"), "login correto", 12000);
  assert.equal(current.App.store().currentAccount().avatar, PHOTO);

  // ---------- 7. troca de senha ----------
  click("#open-password");
  await waitFor(() => !current.document.querySelector("#password-card").classList.contains("hidden"), "card de senha");
  type('#form-password [name="currentPassword"]', "Palco@2026");
  type("#np", "NovoPalco@2027");
  type('#form-password [name="confirmPassword"]', "NovoPalco@2027");
  submit("#form-password");
  await waitFor(() => /Senha alterada|alterada/i.test(current.document.body.textContent), "senha alterada");
  await current.App.store().logout();
  await assert.rejects(() => current.App.store().login("ana@palco.com", "Palco@2026"));
  await current.App.store().login("ana@palco.com", "NovoPalco@2027");

  // ---------- 8. sem erros de JavaScript ----------
  const realErrors = [...first.errors, ...reopened.errors].filter((e) => /Uncaught|TypeError|ReferenceError/i.test(e));
  assert.equal(realErrors.length, 0, "erros de JS: " + realErrors.join(" | "));
});
