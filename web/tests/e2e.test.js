/**
 * Teste ponta a ponta do arquivo dist/palco.html em um DOM real (jsdom),
 * executando o bundle completo: cadastro → sessão persistente → produto →
 * venda → perfil com foto → recarregar e conferir que tudo continua salvo.
 *
 *   node web/tests/e2e.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "dist", "palco.html"), "utf8");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, label, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (predicate()) return true;
    } catch (err) {
      /* continua tentando */
    }
    await sleep(40);
  }
  throw new Error("Timeout aguardando: " + label);
}

/** Cria uma janela nova reaproveitando o localStorage entre "recarregamentos". */
function createWindow(storageBackup) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (err) => errors.push(err));
  virtualConsole.on("error", (...args) => errors.push(new Error(args.join(" "))));

  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole,
  });
  const win = dom.window;
  if (storageBackup) {
    Object.entries(storageBackup).forEach(([key, value]) => win.localStorage.setItem(key, value));
  }
  return { dom, win, errors };
}

function snapshotStorage(win) {
  const out = {};
  for (let i = 0; i < win.localStorage.length; i++) {
    const key = win.localStorage.key(i);
    out[key] = win.localStorage.getItem(key);
  }
  return out;
}

/** Seleciona dentro do modal mais recente (o anterior pode estar em fade-out). */
function resolve(win, selector) {
  if (selector.indexOf(".modal ") === 0) {
    const modals = win.document.querySelectorAll(".modal");
    const last = modals[modals.length - 1];
    assert.ok(last, "nenhum modal aberto");
    return last.querySelector(selector.slice(".modal ".length));
  }
  return win.document.querySelector(selector);
}

function typeInto(win, selector, value) {
  const input = resolve(win, selector);
  assert.ok(input, "campo não encontrado: " + selector);
  input.value = value;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  return input;
}

function submit(win, selector) {
  const form = win.document.querySelector(selector);
  assert.ok(form, "formulário não encontrado: " + selector);
  form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
}

function click(win, selector) {
  const node = resolve(win, selector);
  assert.ok(node, "elemento não encontrado: " + selector);
  node.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  return node;
}

test("fluxo completo no navegador (jsdom)", async (t) => {
  const { win, errors } = createWindow();
  await waitFor(() => win.document.querySelector(".app-shell"), "app abrindo direto");

  // ---------- sem login, sem cadastro ----------
  assert.equal(win.document.querySelector("#form-login"), null, "não existe tela de login");
  assert.equal(win.document.querySelector("#auth-forms"), null, "não existe cadastro");
  assert.match(win.document.querySelector(".sidebar-logo-text").textContent, /Passarela/i);
  assert.ok(win.document.querySelector(".brand-mark-img"), "logo na lateral");
  assert.equal(win.App.store().isAuthenticated(), true, "abre já utilizável");

  // ---------- produto ----------
  win.App.navigate("products");
  await waitFor(() => win.document.querySelector("[data-new-product]"), "botão novo produto");
  click(win, "[data-new-product]");
  await waitFor(() => resolve(win, ".modal [name='name']"), "modal de produto");
  typeInto(win, ".modal [name='name']", "Vestido Midi Floral");
  typeInto(win, ".modal [name='price']", "189,90");
  typeInto(win, ".modal [name='cost']", "75");
  typeInto(win, ".modal [name='stock']", "4");
  click(win, ".modal .btn-primary");
  await waitFor(() => win.App.store().listProducts().length === 1, "produto salvo", 8000);
  assert.equal(win.App.store().listProducts()[0].price, 189.9);

  // ---------- cliente ----------
  win.App.navigate("customers");
  await waitFor(() => win.document.querySelector("[data-new-customer]"), "botão novo cliente");
  click(win, "[data-new-customer]");
  await waitFor(() => resolve(win, ".modal [name='name']"), "modal de cliente");
  typeInto(win, ".modal [name='name']", "Cliente Teste");
  typeInto(win, ".modal [name='phone']", "31988887777");
  click(win, ".modal .btn-primary");
  await waitFor(() => win.App.store().listCustomers().length === 1, "cliente salvo", 8000);

  // ---------- venda no PDV ----------
  win.App.navigate("pos");
  await waitFor(() => win.document.querySelector("[data-add]"), "grade do PDV");
  click(win, "[data-add]");
  await waitFor(() => win.document.querySelector(".cart-line"), "item no carrinho");
  assert.match(win.document.querySelector(".sum-row.total").textContent, /189,90/);
  typeInto(win, "#pos-paid", "200");
  const paid = win.document.querySelector("#pos-paid");
  paid.dispatchEvent(new win.Event("change", { bubbles: true }));
  await waitFor(() => win.document.querySelector("#pos-finalize"), "botão finalizar");
  click(win, "#pos-finalize");
  await waitFor(() => win.App.store().listSales().length === 1, "venda registrada", 8000);

  const sale = win.App.store().listSales()[0];
  assert.equal(sale.total, "189.90");
  assert.equal(win.App.store().listProducts()[0].stock, 3);

  // ---------- perfil: foto + dados ----------
  win.App.navigate("profile");
  await waitFor(() => win.document.querySelector("#form-profile"), "formulário de perfil");
  assert.equal(win.document.querySelector("#form-profile [name='email']"), null, "perfil não pede e-mail");
  assert.equal(win.document.querySelector("#form-password"), null, "perfil não pede senha");
  typeInto(win, "#form-profile [name='city']", "Ipatinga");
  typeInto(win, "#form-profile [name='bio']", "Dona da loja");
  submit(win, "#form-profile");
  await waitFor(() => win.App.store().getUser().city === "Ipatinga", "perfil salvo", 8000);

  // simula upload de foto (sem canvas real: grava a data URL direto pelo store)
  const fakePhoto = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/2gAIAQEAAQUCf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCf//Z";
  await win.App.store().updateProfile({ avatar: fakePhoto });
  win.App.render();
  await waitFor(() => win.document.querySelector("#profile-avatar img"), "foto no hero do perfil");
  assert.equal(win.App.store().getUser().avatar, fakePhoto);

  // ---------- "fechar e abrir o site" ----------
  await waitFor(() => JSON.stringify(snapshotStorage(win)).includes("operador"), "perfil no storage", 4000);
  const backup = snapshotStorage(win);
  assert.ok(Object.keys(backup).some((k) => k.includes("settings")), "configurações/perfil devem estar no storage");
  const settingsKey = Object.keys(backup).find((k) => k.endsWith("settings"));
  assert.ok(settingsKey, "as configurações devem estar no storage");
  const savedSettings = JSON.parse(backup[settingsKey]);
  assert.equal(savedSettings.profile.id, "operador", "o perfil do operador deve estar salvo");
  assert.equal(savedSettings.profile.avatar, fakePhoto, "a foto de perfil deve estar salva");
  assert.equal(JSON.stringify(backup).includes("admin123"), false, "nada de senha no programa");

  const second = createWindow(backup);
  await waitFor(() => second.win.document.querySelector(".app-shell"), "sessão restaurada ao reabrir", 12000);
  assert.equal(second.win.App.store().getUser().id, "operador");
  assert.equal(second.win.App.store().listProducts().length, 1);
  assert.equal(second.win.App.store().listSales().length, 1);
  assert.equal(second.win.App.store().getUser().avatar, fakePhoto);

  // ---------- reabrir não pede nada ----------
  assert.equal(second.win.document.querySelector("#form-login"), null, "nunca pede login");

  // ---------- dashboard e financeiro renderizam ----------
  second.win.App.navigate("dashboard");
  await waitFor(() => second.win.document.querySelector(".kpi-value"), "KPIs do painel");
  second.win.App.navigate("finance");
  await waitFor(() => second.win.document.querySelector("#view"), "financeiro");
  second.win.App.navigate("reports");
  await waitFor(() => second.win.document.querySelector(".chart-bars, .empty"), "relatórios");
  second.win.App.navigate("settings");
  await waitFor(() => second.win.document.querySelector("#form-settings"), "configurações");

  assert.equal(errors.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e.message)).length, 0,
    "erros de JavaScript: " + errors.map((e) => e.message).join(" | "));
  void t;
});
