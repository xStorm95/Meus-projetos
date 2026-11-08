/**
 * Teste ponta a ponta do CAIXA no bundle real (jsdom):
 * abrir caixa → vender → sangria → fechar → histórico → calendário.
 *
 *   node web/tests/cash.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "dist", "palco.html"), "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, label, timeout = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (predicate()) return true;
    } catch (err) {
      /* continua */
    }
    await sleep(40);
  }
  throw new Error("Timeout aguardando: " + label);
}

function createWindow() {
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
  return { dom, win: dom.window, errors };
}

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

function click(win, selector) {
  const node = resolve(win, selector);
  assert.ok(node, "elemento não encontrado: " + selector);
  node.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  return node;
}

test("caixa: abrir, vender, sangria, fechar, histórico e calendário", async () => {
  const { win, errors } = createWindow();
  await waitFor(() => win.document.querySelector(".app-shell"), "app abrindo");

  const store = win.App.store();

  // ---------- produto para vender ----------
  await store.saveProduct({ name: "Vestido Midi Floral", price: "189,90", cost: "75", stock: "3" });
  const product = store.listProducts()[0];
  assert.equal(product.price, 189.9);

  // ---------- abrir caixa pela interface ----------
  win.App.navigate("cash");
  await waitFor(() => win.document.querySelector("[data-cash='open']"), "botão abrir caixa");
  click(win, "[data-cash='open']");
  await waitFor(() => resolve(win, ".modal [name='openingAmount']"), "modal de abertura");
  typeInto(win, ".modal [name='openingAmount']", "200");
  click(win, ".modal .btn-primary");
  await waitFor(() => store.activeCashSession(), "caixa aberto", 8000);
  assert.equal(store.activeCashSession().openingAmount, 200);

  // ---------- vender em dinheiro ----------
  const sessionId = store.activeCashSession().id;
  await store.createSale({
    items: [{ productId: product.id, quantity: 1, unitPrice: product.price }],
    paymentMethod: "DINHEIRO",
    paidAmount: 200,
    discount: 0,
  });
  assert.equal(store.listSales().length, 1);
  assert.equal(store.listSales()[0].cashSessionId, sessionId, "venda vinculada ao caixa");

  let totals = store.cashTotals(store.activeCashSession());
  assert.equal(totals.received, 189.9);
  assert.equal(totals.expected, 389.9, "200 de fundo + 189,90 recebido");

  // ---------- sangria ----------
  await store.cashMovement("sangria", { amount: "100", reason: "Depósito" });
  totals = store.cashTotals(store.activeCashSession());
  assert.equal(totals.expected, 289.9);

  // ---------- a tela do caixa mostra os valores certos ----------
  win.App.navigate("cash");
  win.App.render();
  await waitFor(() => win.document.querySelector(".kpi-value"), "KPIs do caixa");
  const page = win.document.querySelector("#view").textContent;
  assert.match(page, /R\$ 289,90/, "gaveta esperada na tela");
  assert.doesNotMatch(page, /R\$ 2,89/, "nada de valor dividido por 100");

  // ---------- fechar caixa (contado 280 → falta 9,90) ----------
  click(win, "#view [data-cash='close']");
  await waitFor(() => resolve(win, ".modal [name='countedAmount']"), "modal de fechamento");
  typeInto(win, ".modal [name='countedAmount']", "280");
  click(win, ".modal .btn-primary");
  await waitFor(() => !store.activeCashSession(), "caixa fechado", 8000);

  const closed = store.listCashSessions()[0];
  assert.equal(closed.status, "FECHADO");
  assert.equal(closed.expectedAmount, 289.9);
  assert.equal(closed.countedAmount, 280);
  assert.equal(closed.difference, -9.9);

  // ---------- comprovante de fechamento ----------
  await waitFor(() => win.document.querySelector(".receipt-preview"), "comprovante de caixa");
  const receipt = win.document.querySelector(".receipt-preview").innerHTML;
  assert.match(receipt, /R\$ 289,90/, "esperado no comprovante");
  assert.match(receipt, /-R\$ 9,90/, "diferença no comprovante");
  assert.match(receipt, /Fechamento de caixa/i, "título do comprovante");
  click(win, ".modal .btn-outline");
  await waitFor(() => !win.document.querySelector(".receipt-preview") || true, "fechar comprovante");

  // ---------- histórico ----------
  click(win, "[data-cashtab='historico']");
  await waitFor(() => win.document.querySelector("[data-cash-detail]"), "tabela do histórico");
  const history = win.document.querySelector("#view").textContent;
  assert.match(history, /R\$ 289,90/, "esperado no histórico");
  assert.match(history, /-R\$ 9,90/, "diferença negativa no histórico");

  // ---------- calendário ----------
  click(win, "[data-cashtab='calendario']");
  await waitFor(() => win.document.querySelector("[data-cal-day]"), "grade do calendário");
  const today = new Date();
  const key = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const cell = win.document.querySelector('[data-cal-day="' + key + '"]');
  assert.ok(cell, "o dia de hoje deve existir no calendário");
  assert.ok(/has-sales|has-money/.test(cell.className), "o dia com movimento é marcado");
  cell.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  await waitFor(() => win.document.querySelector("#view").textContent.includes("Faturamento"), "detalhe do dia");
  assert.match(win.document.querySelector("#view").textContent, /R\$ 189,90/);

  // ---------- abrir um segundo caixa depois de fechar ----------
  click(win, "[data-cashtab='atual']");
  await waitFor(() => win.document.querySelector("[data-cash='open']"), "abrir novo caixa");
  click(win, "[data-cash='open']");
  await waitFor(() => resolve(win, ".modal [name='openingAmount']"), "modal de abertura 2");
  typeInto(win, ".modal [name='openingAmount']", "50");
  click(win, ".modal .btn-primary");
  await waitFor(() => store.activeCashSession() && store.listCashSessions().length === 2, "segundo caixa", 8000);
  assert.equal(store.activeCashSession().openingAmount, 50);

  assert.equal(
    errors.filter((e) => /Uncaught|TypeError|ReferenceError/.test(e.message)).length,
    0,
    "erros de JavaScript: " + errors.map((e) => e.message).join(" | ")
  );
});
