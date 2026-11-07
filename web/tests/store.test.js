/*
 * Testes do store com um banco em memória — cobrem cadastro, login, sessão
 * persistente (fechar e abrir o site), perfil, produtos, estoque, vendas,
 * despesas e exportação.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/core.js");
const hash = require("../src/hash.js");
const { createStore } = require("../src/store.js");

/** Banco em memória com a mesma interface do PassarelaDB. */
function memoryDB() {
  const data = new Map();
  return {
    data,
    async init() {
      return "memory";
    },
    async get(key, fallback) {
      return data.has(key) ? data.get(key) : fallback;
    },
    async set(key, value) {
      if (value === null) data.delete(key);
      else data.set(key, JSON.parse(JSON.stringify(value)));
      return true;
    },
    async keys() {
      return Array.from(data.keys());
    },
    async clearAll() {
      data.clear();
    },
    driver() {
      return "memory";
    },
  };
}

function makeStore() {
  const db = memoryDB();
  return { db, store: createStore({ db, hash, core }) };
}

const ALICE = {
  name: "Alice Ferreira",
  email: "alice@loja.com",
  password: "Passarela@2026",
  passwordConfirm: "Passarela@2026",
  document: "529.982.247-25",
  phone: "(31) 99999-8888",
};

test("acesso por senha única: admin123 entra e inicia sessão", async () => {
  const { store } = makeStore();
  await store.load();
  const entered = await store.loginWithPassword("admin123");
  assert.equal(entered, true);
  assert.equal(store.isAuthenticated(), true);
  assert.equal(store.getUser().role, "admin");
  assert.ok(!("accessHash" in store.getUser()), "o hash nunca sai no perfil público");
});

test("a variante admin também entra", async () => {
  const { store } = makeStore();
  await store.load();
  assert.equal(await store.loginWithPassword("admin"), true);
  assert.equal(store.isAuthenticated(), true);
});

test("senha errada e senha vazia não entram", async () => {
  const { store } = makeStore();
  await store.load();
  assert.equal(await store.loginWithPassword("errada123"), false);
  assert.equal(await store.loginWithPassword(""), false);
  assert.equal(store.isAuthenticated(), false);
});

test("a senha não é gravada em texto puro", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const settings = await db.get("settings", {});
  assert.match(settings.accessHash, /^pbkdf2\$/);
  assert.ok(!JSON.stringify(settings).includes('"admin123"'), "senha em texto puro vazou no storage");
});

test("sessão sobrevive ao fechar e reabrir o site (novo store, mesmo banco)", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const store2 = createStore({ db, hash, core });
  await store2.load();
  assert.equal(store2.isAuthenticated(), true);
  assert.equal(store2.getUser().id, "operador");
});

test("logout limpa a sessão e não volta logado", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await store.logout();
  assert.equal(store.isAuthenticated(), false);
  const store2 = createStore({ db, hash, core });
  await store2.load();
  assert.equal(store2.isAuthenticated(), false);
});

test("sessão expirada é descartada no carregamento", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const session = await db.get("session", {});
  await db.set("session", { ...session, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const store2 = createStore({ db, hash, core });
  await store2.load();
  assert.equal(store2.isAuthenticated(), false);
});

test("troca de senha exige a atual e passa a valer no login", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await assert.rejects(() => store.changePassword("errada", "NovaSenha@2026"), /incorreta/);
  await store.changePassword("admin123", "NovaSenha@2026");
  await store.logout();
  assert.equal(await store.loginWithPassword("admin123"), false);
  assert.equal(await store.loginWithPassword("NovaSenha@2026"), true);
});

test("resetPassword volta a senha para admin123", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await store.changePassword("admin123", "OutraSenha@2026");
  await store.logout();
  assert.equal(await store.loginWithPassword("admin123"), false);
  await store.loginWithPassword("OutraSenha@2026");
  await store.resetPassword();
  await store.logout();
  assert.equal(await store.loginWithPassword("admin123"), true);
});

test("perfil: edita dados, foto e mantém tudo após recarregar", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  await store.updateProfile({ name: "Alice F. Souza", city: "Ipatinga", bio: "Dona da loja", avatar });

  const store2 = createStore({ db, hash, core });
  await store2.load();
  const user = store2.getUser();
  assert.equal(user.name, "Alice F. Souza");
  assert.equal(user.city, "Ipatinga");
  assert.equal(user.avatar, avatar);
});

test("perfil recusa CPF inválido e mantém a foto", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await assert.rejects(
    () => store.updateProfile({ document: "111.111.111-11" }),
    (err) => Boolean(err.fields.document),
  );
});

test("produto: cria, edita, valida e remove", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");

  const product = await store.saveProduct({ name: "Vestido Midi", price: 199.9, cost: 80, stock: 5, category: "Vestidos", size: "M", color: "Preto" });
  assert.equal(product.price, 199.9);
  assert.equal(store.listProducts().length, 1);

  await assert.rejects(() => store.saveProduct({ name: "", price: 10 }), (e) => Boolean(e.fields.name));
  await assert.rejects(() => store.saveProduct({ name: "Produto X", price: -5 }), (e) => Boolean(e.fields.price));
  await assert.rejects(() => store.saveProduct({ name: "Produto X", price: 10, stock: -1 }), (e) => Boolean(e.fields.stock));

  const edited = await store.saveProduct({ id: product.id, name: "Vestido Longo", price: 249.9, cost: 90, stock: 8 });
  assert.equal(edited.name, "Vestido Longo");
  assert.equal(store.listProducts()[0].price, 249.9);

  await store.deleteProduct(product.id);
  assert.equal(store.listProducts().length, 0);
});

test("venda: baixa estoque, calcula troco e recusa estoque insuficiente", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const p1 = await store.saveProduct({ name: "Blusa", price: 100, cost: 40, stock: 3 });
  const p2 = await store.saveProduct({ name: "Calça", price: 150, cost: 70, stock: 2 });
  const customer = await store.saveCustomer({ name: "Maria Cliente", phone: "31999998888" });

  const sale = await store.createSale({
    customerId: customer.id,
    items: [{ productId: p1.id, quantity: 2 }, { productId: p2.id, quantity: 1 }],
    paidAmount: 400,
    paymentMethod: "PIX",
  });

  assert.equal(sale.total, "350.00");
  assert.equal(sale.change, "50.00");
  assert.equal(sale.code, "V-000001");
  assert.equal(store.listProducts().find((p) => p.id === p1.id).stock, 1);
  assert.equal(store.listProducts().find((p) => p.id === p2.id).stock, 1);

  await assert.rejects(
    () => store.createSale({ items: [{ productId: p1.id, quantity: 5 }], paidAmount: 500 }),
    /insuficiente/,
  );
  // estoque não pode ter sido alterado pela tentativa falha
  assert.equal(store.listProducts().find((p) => p.id === p1.id).stock, 1);
});

test("venda fiado registra saldo e aparece no dashboard", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const product = await store.saveProduct({ name: "Saia", price: 200, cost: 80, stock: 5 });
  const sale = await store.createSale({
    items: [{ productId: product.id, quantity: 1 }],
    paidAmount: 50,
    allowDebt: true,
  });
  assert.equal(sale.balance, "150.00");
  const dash = store.dashboard();
  assert.equal(dash.openDebt, 150);
});

test("cancelamento devolve estoque e marca a venda", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const product = await store.saveProduct({ name: "Short", price: 90, cost: 30, stock: 4 });
  const sale = await store.createSale({ items: [{ productId: product.id, quantity: 2 }], paidAmount: 180 });
  assert.equal(store.listProducts()[0].stock, 2);

  await store.cancelSale(sale.id, "Cliente desistiu");
  assert.equal(store.listProducts()[0].stock, 4);
  assert.equal(store.listSales()[0].status, "CANCELADA");
  await assert.rejects(() => store.cancelSale(sale.id, "de novo"), /já está cancelada/);

  const dash = store.dashboard();
  assert.equal(dash.salesCount, 0);
  assert.equal(dash.revenue, 0);
});

test("dashboard calcula lucro, ticket e produtos mais vendidos", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const a = await store.saveProduct({ name: "Produto A", price: 100, cost: 40, stock: 10 });
  const b = await store.saveProduct({ name: "Produto B", price: 50, cost: 50, stock: 10 });
  await store.createSale({ items: [{ productId: a.id, quantity: 2 }], paidAmount: 200 });
  await store.createSale({ items: [{ productId: b.id, quantity: 2 }], paidAmount: 100 });
  await store.saveExpense({ description: "Aluguel", amount: 50, category: "Aluguel" });

  const dash = store.dashboard();
  assert.equal(dash.revenue, 300);
  assert.equal(dash.cost, 180);
  assert.equal(dash.expenses, 50);
  assert.equal(dash.profit, 70);
  assert.equal(dash.ticket, 150);
  assert.equal(dash.salesCount, 2);
  assert.equal(dash.topProducts[0].key, "Produto A");
});

test("despesas: cria, exige valor, alterna pagamento e remove", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await assert.rejects(() => store.saveExpense({ description: "Conta", amount: 0 }), /maior que zero/);
  const expense = await store.saveExpense({ description: "Energia", amount: 320.5, category: "Contas" });
  assert.equal(store.dashboard().expenses, 320.5);
  await store.toggleExpensePaid(expense.id);
  assert.equal(store.dashboard().expenses, 0);
  await store.deleteExpense(expense.id);
  assert.equal(store.listExpenses().length, 0);
});

test("exportação não inclui hash de senha", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const dump = await store.exportAll();
  const text = JSON.stringify(dump);
  assert.ok(!text.includes("pbkdf2$"), "hash de senha não deve ser exportado");
  assert.equal(dump.settings.accessHash, undefined);
});

test("wipeData apaga tudo e volta ao estado inicial", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  await store.saveProduct({ name: "Produto", price: 10 });
  await store.wipeData();
  assert.equal(store.isAuthenticated(), false);
  assert.equal(store.listProducts().length, 0);
  // o acesso continua valendo e o perfil é preservado
  assert.equal(await store.loginWithPassword("admin123"), true);
});

test("receber saldo de fiado quita a venda e atualiza o dashboard", async () => {
  const { store } = makeStore();
  await store.load();
  await store.loginWithPassword("admin123");
  const product = await store.saveProduct({ name: "Bolsa", price: 300, cost: 100, stock: 3 });
  const sale = await store.createSale({
    items: [{ productId: product.id, quantity: 1 }],
    paidAmount: 100,
    allowDebt: true,
  });
  assert.equal(store.dashboard().openDebt, 200);

  const partial = await store.receiveDebt(sale.id, 50);
  assert.equal(partial.balance, "150.00");
  assert.equal(store.dashboard().openDebt, 150);

  const settled = await store.receiveDebt(sale.id);
  assert.equal(settled.balance, "0.00");
  assert.equal(settled.paid, "300.00");
  assert.ok(settled.settledAt);
  assert.equal(store.dashboard().openDebt, 0);

  await assert.rejects(() => store.receiveDebt(sale.id), /já está quitada/);
  await assert.rejects(() => store.receiveDebt("inexistente"), /não encontrada/);
});
