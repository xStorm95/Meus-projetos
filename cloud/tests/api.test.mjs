/**
 * Testes de integração da API contra um servidor rodando.
 * Antes: npm run db:migrate && npm run dev (com DATABASE_URL válida)
 * Depois: node --test tests/api.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:3001";

/** "Navegador" de teste com jar de cookies próprio. */
function browser() {
  const jar = new Map();

  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const store = (res) => {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (!value || /expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
      else jar.set(name, value);
    }
    return raw;
  };

  const request = async (path, init = {}) => {
    const res = await fetch(BASE + path, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
        ...(init.headers ?? {}),
      },
      redirect: "manual",
    });
    const setCookies = store(res);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body, setCookies };
  };

  return { request, jar };
}

const stamp = Date.now();
const email = `teste.${stamp}@palco.dev`;
const password = "PalcoForte123";
const phone = browser();
const phone2 = browser();

let accountId = null;

before(async () => {
  const health = await fetch(BASE + "/api/auth/session").catch(() => null);
  assert.ok(health, `servidor não respondeu em ${BASE}. Rode "npm run dev" antes dos testes.`);
});

test("1. cadastro cria conta no banco e devolve sessão HttpOnly", async () => {
  const res = await phone.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Ana Ribeiro",
      email,
      password,
      passwordConfirm: password,
      phone: "31999990000",
      city: "Ipatinga, MG",
    }),
  });

  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.account.email, email);
  assert.equal(res.body.account.name, "Ana Ribeiro");
  assert.ok(!("passwordHash" in res.body.account), "hash nunca pode ir para o cliente");
  accountId = res.body.account.id;
  assert.match(accountId, /^[0-9a-f-]{36}$/);
  // Em banco novo a primeira conta vira "owner"; em banco já populado, "member".
  assert.ok(["owner", "member"].includes(res.body.account.role), "papel válido");

  const cookie = res.setCookies.join(" ");
  assert.match(cookie, /conta_session=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
});

test("2. sessão reconhece o usuário logado", async () => {
  const res = await phone.request("/api/auth/session");
  assert.equal(res.status, 200);
  assert.equal(res.body.authenticated, true);
  assert.equal(res.body.account.id, accountId);
  assert.ok(Array.isArray(res.body.sessions));
});

test("3. e-mail duplicado é recusado com 409", async () => {
  const res = await phone2.request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name: "Outra Pessoa", email, password, passwordConfirm: password }),
  });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /já tem conta/i);
});

test("4. senha fraca é recusada com 422 e erro por campo", async () => {
  const res = await browser().request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Teste Fraco",
      email: `fraco.${stamp}@palco.dev`,
      password: "12345678",
      passwordConfirm: "12345678",
    }),
  });
  assert.equal(res.status, 422);
  assert.ok(res.body.fields.password, "precisa apontar o campo senha");
});

test("5. senha errada devolve 401 com mensagem genérica", async () => {
  const res = await browser().request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "SenhaErrada999" }),
  });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /incorretos/i);
  assert.ok(!/não existe/i.test(res.body.error), "não pode revelar se o e-mail existe");
});

test("6. login em outro aparelho abre a MESMA conta", async () => {
  const res = await phone2.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.account.id, accountId);
});

test("7. foto enviada pelo aparelho 1 aparece no aparelho 2", async () => {
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDoJnc6BpjDyQgNx0rCgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECDwW3gZJ0ABy8nFzAAAAABJRU5ErkJggg==";

  const put = await phone.request("/api/profile/avatar", {
    method: "PUT",
    body: JSON.stringify({ avatar: pixel }),
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.saved, true);
  assert.equal(put.body.account.avatar, pixel);

  const other = await phone2.request("/api/auth/session");
  assert.equal(other.body.account.avatar, pixel, "a foto precisa vir do servidor no outro aparelho");
});

test("8. foto grande/ inválida é rejeitada", async () => {
  const res = await phone.request("/api/profile/avatar", {
    method: "PUT",
    body: JSON.stringify({ avatar: "data:image/png;base64," + "A".repeat(800 * 1024) }),
  });
  assert.equal(res.status, 413);
});

test("9. edição de perfil no aparelho 1 reflete no aparelho 2", async () => {
  const patch = await phone.request("/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ name: "Ana Ribeiro Silva", city: "Ipatinga", bio: "Designer" }),
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body.account.name, "Ana Ribeiro Silva");

  const other = await phone2.request("/api/auth/session");
  assert.equal(other.body.account.name, "Ana Ribeiro Silva");
  assert.equal(other.body.account.city, "Ipatinga");
  assert.equal(other.body.account.bio, "Designer");
});

test("10. troca de senha exige a senha atual", async () => {
  const wrong = await phone.request("/api/profile/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: "nadaver777", newPassword: "NovaSenha456", confirmPassword: "NovaSenha456" }),
  });
  assert.equal(wrong.status, 422);
  assert.ok(wrong.body.fields.currentPassword);

  const okRes = await phone.request("/api/profile/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: password, newPassword: "NovaSenha456", confirmPassword: "NovaSenha456" }),
  });
  assert.equal(okRes.status, 200, JSON.stringify(okRes.body));

  const loginOld = await browser().request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert.equal(loginOld.status, 401, "a senha antiga não pode mais entrar");

  const loginNew = await browser().request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "NovaSenha456" }),
  });
  assert.equal(loginNew.status, 200, "a senha nova entra");
});

test("11. logout encerra a sessão no banco", async () => {
  const out = await phone2.request("/api/auth/logout", { method: "POST" });
  assert.equal(out.status, 200);

  const after = await phone2.request("/api/auth/session");
  assert.equal(after.body.authenticated, false);
  assert.equal(after.body.account, null, "o servidor não devolve mais a conta");
});

test("12. rota protegida sem sessão devolve 401", async () => {
  const res = await browser().request("/api/profile", {
    method: "PATCH",
    body: JSON.stringify({ name: "Invasor" }),
  });
  assert.equal(res.status, 401);
});

after(async () => {
  // limpeza: apaga a conta criada pelos testes
  const login = await phone.request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "NovaSenha456" }),
  });
  if (login.status === 200) {
    await phone.request("/api/account", { method: "DELETE", body: JSON.stringify({ password: "NovaSenha456" }) });
  }
});
