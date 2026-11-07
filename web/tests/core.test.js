/* Testes do núcleo do app offline (node --test). */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const core = require("../src/core.js");
const hash = require("../src/hash.js");

test("SHA-256 e HMAC idênticos ao node:crypto", () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 120, 1000]) {
    const msg = "a".repeat(n);
    assert.deepEqual(
      Buffer.from(hash.sha256(Buffer.from(msg))),
      crypto.createHash("sha256").update(msg).digest(),
      `sha256 falhou para ${n} bytes`,
    );
  }
  const key = "chave-secreta";
  const msg = "mensagem";
  assert.deepEqual(
    Buffer.from(hash.hmacSha256(Buffer.from(key), Buffer.from(msg))),
    crypto.createHmac("sha256", key).update(msg).digest(),
  );
});

test("PBKDF2 idêntico ao node:crypto", () => {
  for (const iterations of [1, 2, 1000, 4096]) {
    assert.deepEqual(
      Buffer.from(hash.pbkdf2(Buffer.from("Passarela@2026"), Buffer.from("salt-fixo"), iterations)),
      crypto.pbkdf2Sync("Passarela@2026", "salt-fixo", iterations, 32, "sha256"),
    );
  }
});

test("base64 ida e volta", () => {
  const bytes = new Uint8Array([0, 1, 2, 127, 128, 200, 250, 255]);
  const b64 = hash.bytesToBase64(bytes);
  assert.deepEqual(Array.from(hash.base64ToBytes(b64)), Array.from(bytes));
});

test("CPF válido e inválido", () => {
  assert.equal(core.isValidCPF("529.982.247-25"), true);
  assert.equal(core.isValidCPF("52998224725"), true);
  assert.equal(core.isValidCPF("111.111.111-11"), false);
  assert.equal(core.isValidCPF("529.982.247-26"), false);
  assert.equal(core.isValidCPF("1234567890"), false);
});

test("CNPJ válido e inválido", () => {
  assert.equal(core.isValidCNPJ("11.222.333/0001-81"), true);
  assert.equal(core.isValidCNPJ("11.222.333/0001-82"), false);
  assert.equal(core.isValidCNPJ("00000000000000"), false);
});

test("máscaras de documento e telefone", () => {
  assert.equal(core.maskCPF("52998224725"), "529.982.247-25");
  assert.equal(core.maskCNPJ("11222333000181"), "11.222.333/0001-81");
  assert.equal(core.maskPhone("31999998888"), "(31) 99999-8888");
  assert.equal(core.maskPhone("3133334444"), "(31) 3333-4444");
});

test("dinheiro: centavos sem erro de ponto flutuante", () => {
  assert.equal(core.toCents(0.1) + core.toCents(0.2), core.toCents(0.3));
  assert.equal(core.brl("1234.5"), "R$ 1.234,50");
  assert.equal(core.brl(-25), "-R$ 0,25");
  assert.equal(core.brl("0"), "R$ 0,00");
  assert.equal(core.parseMoneyInput("R$ 1.234,56"), 1234.56);
  assert.equal(core.parseMoneyInput("89,90"), 89.9);
  assert.equal(core.parseMoneyInput(""), 0);
});

test("totais da venda com desconto por item e desconto geral", () => {
  const result = core.computeSaleTotals({
    items: [
      { id: "a", unitPrice: 99.9, quantity: 2 },
      { id: "b", unitPrice: 150, quantity: 1, discount: 50 },
    ],
    discount: 10,
    paidAmount: 300,
  });
  assert.equal(result.subtotal, "349.80");
  assert.equal(result.discount, "60.00");
  assert.equal(result.total, "289.80");
  assert.equal(result.paid, "300.00");
  assert.equal(result.change, "10.20");
  assert.equal(result.balance, "0.00");
  assert.equal(result.itemCount, 3);
});

test("desconto nunca deixa o total negativo", () => {
  const result = core.computeSaleTotals({ items: [{ unitPrice: 100, quantity: 1 }], discount: 500 });
  assert.equal(result.total, "0.00");
});

test("venda a prazo gera saldo devedor", () => {
  const result = core.computeSaleTotals({
    items: [{ unitPrice: 250, quantity: 1 }],
    paidAmount: 100,
  });
  assert.equal(result.balance, "150.00");
  assert.equal(result.change, "0.00");
});

test("estoque insuficiente é detectado por item", () => {
  const index = { p1: { id: "p1", stock: 2 }, p2: { id: "p2", stock: 10 } };
  assert.deepEqual(core.stockIssues([{ productId: "p1", quantity: 2 }], index), []);
  const issues = core.stockIssues(
    [
      { productId: "p1", quantity: 3 },
      { productId: "p9", quantity: 1 },
    ],
    index,
  );
  assert.equal(issues.length, 2);
  assert.match(issues[0].reason, /insuficiente/);
  assert.match(issues[1].reason, /não encontrado/);
});

test("resumo financeiro e margem", () => {
  const summary = core.financialSummary({
    payments: [
      { method: "DINHEIRO", amount: 600 },
      { method: "PIX", amount: 400 },
    ],
    expenses: [{ category: "Aluguel", amount: 300 }],
    costOfGoods: 500,
  });
  assert.equal(summary.gross, "1000.00");
  assert.equal(summary.expenses, "300.00");
  assert.equal(summary.result, "200.00");
  assert.equal(summary.marginPercent, 20);
  assert.equal(summary.byMethod.length, 2);
});

test("validação de cadastro", () => {
  const existing = [{ email: "maria@loja.com" }];
  const ok = core.validateSignup({
    name: "João da Silva",
    email: "joao@loja.com",
    password: "Passarela@2026",
    passwordConfirm: "Passarela@2026",
    document: "529.982.247-25",
    phone: "(31) 99999-8888",
  }, existing);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));

  const dup = core.validateSignup(
    { name: "Maria", email: "MARIA@loja.com", password: "Passarela@2026", passwordConfirm: "Passarela@2026" },
    existing,
  );
  assert.equal(dup.valid, false);
  assert.match(dup.errors.email, /já está cadastrado/);

  const weak = core.validateSignup(
    { name: "Ana", email: "ana@loja.com", password: "12345678", passwordConfirm: "12345678" },
    [],
  );
  assert.equal(weak.valid, false);
  assert.ok(weak.errors.password);

  const mismatch = core.validateSignup(
    { name: "Ana Souza", email: "ana@loja.com", password: "Passarela@2026", passwordConfirm: "outra" },
    [],
  );
  assert.match(mismatch.errors.passwordConfirm, /não conferem/);

  const badDoc = core.validateSignup(
    { name: "Ana Souza", email: "ana@loja.com", password: "Passarela@2026", passwordConfirm: "Passarela@2026", document: "111.111.111-11" },
    [],
  );
  assert.match(badDoc.errors.document, /inválido/);
});

test("bloqueio após 5 tentativas e janela de 15 minutos", () => {
  let user = { failedAttempts: 0, lockedUntil: null };
  const now = new Date("2026-11-07T12:00:00Z").getTime();
  for (let i = 0; i < 4; i++) user = Object.assign(user, core.registerFailedAttempt(user, now));
  assert.equal(core.isLocked(user, now), false);
  user = Object.assign(user, core.registerFailedAttempt(user, now));
  assert.equal(user.failedAttempts, 5);
  assert.equal(core.isLocked(user, now), true);
  assert.equal(core.isLocked(user, now + 15 * 60 * 1000 + 1), false);
  assert.deepEqual(core.resetAttempts(), { failedAttempts: 0, lockedUntil: null });
});

test("força de senha pontua corretamente", () => {
  assert.equal(core.passwordScore("12345678"), 2);
  assert.equal(core.passwordScore("Passarela@2026"), 4);
  assert.equal(core.validatePasswordStrength("Passarela@2026"), null);
  assert.ok(core.validatePasswordStrength("abcdefgh"));
});

test("sequência de código", () => {
  assert.equal(core.nextCode("V-", 0), "V-000001");
  assert.equal(core.nextCode("V-", 41), "V-000042");
  assert.equal(core.nextCode("ORC-", 9, 4), "ORC-0010");
});

test("CSV compatível com Excel pt-BR", () => {
  const csv = core.toCsv(["Nome", "Valor"], [["Vestido; midi", 10], ["Blusa \"P\"", 20]]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Nome;Valor");
  assert.equal(lines[1], '"Vestido; midi";10');
  assert.equal(lines[2], '"Blusa ""P""";20');
});

test("datas e período", () => {
  assert.equal(core.formatDateBR("2026-11-07"), "07/11/2026");
  assert.equal(core.formatDateBR(""), "—");
  assert.equal(core.withinPeriod("2026-11-07T10:00:00.000Z", "2026-11-01", "2026-11-30"), true);
  assert.equal(core.withinPeriod("2026-10-31T10:00:00.000Z", "2026-11-01", "2026-11-30"), false);
});

test("saudação por horário e tempo relativo", () => {
  assert.equal(core.greeting(new Date("2026-11-07T09:00:00")), "Bom dia");
  assert.equal(core.greeting(new Date("2026-11-07T15:00:00")), "Boa tarde");
  assert.equal(core.greeting(new Date("2026-11-07T21:00:00")), "Boa noite");
  const now = new Date("2026-11-07T12:00:00Z").getTime();
  assert.equal(core.relativeTime("2026-11-07T11:59:30Z", now), "agora mesmo");
  assert.equal(core.relativeTime("2026-11-07T11:00:00Z", now), "há 1 h");
  assert.equal(core.relativeTime("2026-11-06T12:00:00Z", now), "ontem");
});
