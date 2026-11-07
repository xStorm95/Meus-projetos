/* Testes da camada de conta (cadastro, login, sessão, perfil e foto). */
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../assets/core.js");
const hash = require("../assets/hash.js");
const { createStore } = require("../assets/auth.js");

/** Banco falso com a mesma interface usada pela aplicação. */
function fakeDB() {
  const data = new Map();
  return {
    data,
    async init() { return "memory"; },
    async get(key, fallback) { return data.has(key) ? JSON.parse(JSON.stringify(data.get(key))) : fallback; },
    async set(key, value) {
      if (value === null) data.delete(key);
      else data.set(key, value);
      return true;
    },
    driver() { return "memory"; },
  };
}

function makeStore() {
  const db = fakeDB();
  return { db, store: createStore({ db, hash, core }) };
}

const ANA = {
  name: "Ana Beatriz Lopes",
  email: "Ana@Email.com ",
  phone: "(31) 99887-7665",
  document: "529.982.247-25",
  password: "Palco@2026",
  passwordConfirm: "Palco@2026",
};

test("cadastro normaliza nome/e-mail e não guarda a senha", async () => {
  const { db, store } = makeStore();
  await store.load();
  const account = await store.signup(ANA);
  assert.equal(account.email, "ana@email.com");
  assert.equal(account.name, "Ana Beatriz Lopes");
  assert.ok(!("passwordHash" in account), "hash não pode vazar na API pública");

  const raw = await db.get("accounts", []);
  assert.match(raw[0].passwordHash, /^pbkdf2\$/);
  assert.ok(!JSON.stringify(raw).includes("Palco@2026"), "senha em texto puro vazou");
  assert.equal(raw[0].phone, "31998877665");
  assert.equal(raw[0].document, "52998224725");
});

test("cadastro recusa e-mail duplicado, senha fraca e confirmação diferente", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await assert.rejects(
    () => store.signup({ ...ANA, name: "Outra Pessoa" }),
    (err) => /já tem conta/i.test(err.fields.email),
  );
  await assert.rejects(
    () => store.signup({ name: "Bia Souza", email: "bia@x.com", password: "12345678", passwordConfirm: "12345678" }),
    (err) => Boolean(err.fields.password),
  );
  await assert.rejects(
    () => store.signup({ name: "Bia Souza", email: "bia@x.com", password: "Palco@2026", passwordConfirm: "Palco@2027" }),
    (err) => /iguais/i.test(err.fields.passwordConfirm),
  );
  await assert.rejects(
    () => store.signup({ name: "Bia Souza", email: "email-invalido", password: "Palco@2026", passwordConfirm: "Palco@2026" }),
    (err) => Boolean(err.fields.email),
  );
});

test("login com senha certa entra; errada conta tentativas", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await store.logout();

  await assert.rejects(() => store.login("ana@email.com", "errada123"), /incorretos/i);
  const account = await store.login("ANA@EMAIL.COM", "Palco@2026");
  assert.equal(account.name, "Ana Beatriz Lopes");
  assert.equal(store.isAuthenticated(), true);
});

test("5 erros bloqueiam o login por 15 minutos", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await store.logout();
  for (let i = 0; i < 4; i++) await assert.rejects(() => store.login("ana@email.com", "errada123"));
  await assert.rejects(() => store.login("ana@email.com", "errada123"), /bloque/i);
  await assert.rejects(() => store.login("ana@email.com", "Palco@2026"), /bloque/i);
});

test("sessão continua valendo ao reabrir o site", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.signup(ANA);
  // reabrir = nova instância com o mesmo armazenamento
  const reopened = createStore({ db, hash, core });
  await reopened.load();
  assert.equal(reopened.isAuthenticated(), true);
  assert.equal(reopened.currentAccount().email, "ana@email.com");
});

test("logout encerra de verdade e sessão expirada é descartada", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await store.logout();
  const reopened = createStore({ db, hash, core });
  await reopened.load();
  assert.equal(reopened.isAuthenticated(), false);

  await reopened.login("ana@email.com", "Palco@2026");
  const session = await db.get("session", {});
  await db.set("session", { ...session, expiresAt: new Date(Date.now() - 1000).toISOString() });
  const afterExpiry = createStore({ db, hash, core });
  await afterExpiry.load();
  assert.equal(afterExpiry.isAuthenticated(), false);
});

test("foto é salva, confirmada no armazenamento e sobrevive ao recarregar", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.signup(ANA);
  const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL";

  const result = await store.savePhoto(photo);
  assert.equal(result.saved, true, "deve confirmar a gravação");
  assert.equal(result.account.avatar, photo);
  assert.ok(result.account.photoUpdatedAt);

  const reopened = createStore({ db, hash, core });
  await reopened.load();
  assert.equal(reopened.currentAccount().avatar, photo, "a foto precisa voltar depois de reabrir");

  // nova sessão (logout + login) também mantém a foto
  await reopened.logout();
  const afterLogin = createStore({ db, hash, core });
  await afterLogin.load();
  await afterLogin.login("ana@email.com", "Palco@2026");
  assert.equal(afterLogin.currentAccount().avatar, photo);

  await afterLogin.removePhoto();
  assert.equal(afterLogin.currentAccount().avatar, "");

  const cleaned = createStore({ db, hash, core });
  await cleaned.load();
  assert.equal(cleaned.currentAccount().avatar, "");
});

test("recusa foto inválida ou grande demais", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await assert.rejects(() => store.savePhoto("nao-e-imagem"), /Formato/i);
  await assert.rejects(() => store.savePhoto("data:image/gif;base64,AAAA"), /Formato/i);
  const huge = "data:image/jpeg;base64," + "A".repeat(950 * 1024);
  await assert.rejects(() => store.savePhoto(huge), /muito grande/i);
});

test("perfil atualiza dados e valida e-mail/CPF", async () => {
  const { db, store } = makeStore();
  await store.load();
  await store.signup(ANA);
  const updated = await store.updateProfile({
    name: "Ana Beatriz",
    city: "Ipatinga",
    bio: "Dona da loja",
    birthDate: "1994-05-12",
  });
  assert.equal(updated.city, "Ipatinga");
  assert.equal(core.ageFromBirthDate(updated.birthDate) > 20, true);

  await assert.rejects(() => store.updateProfile({ email: "sem-arroba" }), (e) => Boolean(e.fields.email));
  await assert.rejects(() => store.updateProfile({ document: "111.111.111-11" }), (e) => Boolean(e.fields.document));

  const reopened = createStore({ db, hash, core });
  await reopened.load();
  assert.equal(reopened.currentAccount().city, "Ipatinga");
});

test("uma conta não pode usar o e-mail de outra", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await store.logout();
  await store.signup({ name: "Bruno Lima", email: "bruno@email.com", password: "Palco@2026", passwordConfirm: "Palco@2026" });
  await assert.rejects(
    () => store.updateProfile({ email: "ana@email.com" }),
    (err) => /outra conta/i.test(err.fields.email),
  );
});

test("troca de senha exige a atual e passa a valer no login", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await assert.rejects(
    () => store.changePassword("errada", "NovaSenha@2026", "NovaSenha@2026"),
    (err) => Boolean(err.fields.currentPassword),
  );
  await store.changePassword("Palco@2026", "NovaSenha@2026", "NovaSenha@2026");
  await store.logout();
  await assert.rejects(() => store.login("ana@email.com", "Palco@2026"));
  await store.login("ana@email.com", "NovaSenha@2026");
  assert.equal(store.isAuthenticated(), true);
});

test("excluir conta exige senha e remove tudo", async () => {
  const { store } = makeStore();
  await store.load();
  await store.signup(ANA);
  await assert.rejects(() => store.deleteAccount("errada"), /incorreta/i);
  await store.deleteAccount("Palco@2026");
  assert.equal(store.isAuthenticated(), false);
  assert.equal(store.accountCount(), 0);
});

test("validações de e-mail, senha e CPF", () => {
  assert.equal(core.isValidEmail("ana@email.com"), true);
  assert.equal(core.isValidEmail("ana@email"), false);
  assert.equal(core.isValidEmail(" ana@email.com "), true);
  assert.equal(core.isValidEmail("a@b.c"), false);
  assert.equal(core.validatePassword("Palco@2026"), null);
  assert.match(core.validatePassword("12345678"), /comum|letra/i);
  assert.match(core.validatePassword("abcdefgh"), /número/i);
  assert.match(core.validatePassword("Abc1"), /8 caracteres/i);
  assert.equal(core.isValidCPF("529.982.247-25"), true);
  assert.equal(core.isValidCPF("111.111.111-11"), false);
  assert.equal(core.emailStatus("ana@email.com", ["ana@email.com"]).state, "taken");
  assert.equal(core.emailStatus("novo@email.com", ["ana@email.com"]).state, "ok");
  assert.equal(core.formatPhone("31998877665"), "(31) 99887-7665");
  assert.equal(core.initials("Ana Beatriz Lopes"), "AL");
});
