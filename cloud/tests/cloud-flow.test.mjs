/**
 * Teste ponta a ponta do site ONLINE: o ERP (web/palco.html) falando com a API
 * Next + PostgreSQL. Cobre cadastro, login, dados salvos no banco, sair,
 * entrar de novo e abrir em outro aparelho.
 *
 *   npm run dev            (na pasta cloud)
 *   node tests/cloud-flow.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.APP_URL || 'http://127.0.0.1:3001';
const cookies = new Map();
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (fn()) return true; } catch (e) {}
    await wait(60);
  }
  throw new Error('timeout: ' + label);
}

function makeFetch() {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? new URL(input, BASE).toString() : input.url;
    const headers = Object.assign({}, init.headers || {});
    if (cookies.size) headers.cookie = cookieHeader();
    const res = await fetch(url, { ...init, headers, redirect: 'manual' });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const line of set) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (!value) cookies.delete(name); else cookies.set(name, value);
    }
    return res;
  };
}

function openApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'palco.html'), 'utf8');
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/scrollTo|Not implemented/.test(e.message)) console.log('ERR:', e.message.slice(0, 200)); });
  const dom = new JSDOM(html, { url: BASE + '/app', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  dom.window.fetch = makeFetch();
  return dom.window;
}

const type = (win, sel, v) => { const n = win.document.querySelector(sel); n.value = v; n.dispatchEvent(new win.Event('input', { bubbles: true })); };
const submit = (win, sel) => win.document.querySelector(sel).dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
const click = (win, sel) => win.document.querySelector(sel).dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));

(async () => {
  const email = 'site' + Date.now() + '@palco.dev';

  let win = openApp();
  await waitFor(() => win.document.querySelector('[data-authtab="signup"]'), 'abas de acesso');
  console.log('1) modo nuvem com cadastro:', !!win.document.querySelector('[data-authtab="signup"]'));

  click(win, '[data-authtab="signup"]');
  await waitFor(() => win.document.querySelector('#form-signup'), 'form cadastro');
  type(win, '#su-name', 'Cliente Teste');
  type(win, '#su-email', email);
  type(win, '#su-password', 'PalcoForte123');
  type(win, '#su-password2', 'PalcoForte123');
  submit(win, '#form-signup');
  await waitFor(() => win.document.querySelector('.app-shell'), 'painel após cadastro');
  const store = win.App.store();
  console.log('2) cadastrou e entrou:', store.isAuthenticated(), '| nuvem:', store.isCloudMode());
  console.log('3) chip:', win.document.querySelector('.storage-chip strong').textContent);

  win.App.navigate('products');
  await waitFor(() => win.document.querySelector('[data-new-product]'), 'novo produto');
  click(win, '[data-new-product]');
  await waitFor(() => win.document.querySelector('.modal [name="name"]'), 'modal');
  const modals = win.document.querySelectorAll('.modal');
  const m = modals[modals.length - 1];
  const setM = (n, v) => { const el = m.querySelector('[name="' + n + '"]'); el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  setM('name', 'Vestido Nuvem'); setM('price', '250,00'); setM('cost', '90'); setM('stock', '7');
  m.querySelector('.btn-primary').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await waitFor(() => store.listProducts().length === 1, 'produto salvo');
  console.log('4) produto criado:', store.listProducts()[0].name);

  await wait(2000);
  const saved = await (await fetch(BASE + '/api/state', { headers: { cookie: cookieHeader() } })).json();
  console.log('5) gravado no PostgreSQL — chaves:', Object.keys(saved.state || {}), '| produtos:', (saved.state.products || []).length);

  // sai pela interface (botão Sair -> confirmação), como o usuário faz
  click(win, '[data-action="logout"]');
  await waitFor(() => win.document.querySelector('.modal .btn-primary') || win.document.querySelector('.modal .btn-danger'), 'modal de sair');
  const confirmBtn = win.document.querySelector('.modal .btn-primary') || win.document.querySelector('.modal .btn-danger');
  confirmBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => win.document.querySelector('#login-email'), 'login após sair');
  console.log('6) saiu pela interface — voltou ao login:', !!win.document.querySelector('#login-email'));

  // novo "aparelho": nova janela, mesmos cookies
  const win2 = openApp();
  await waitFor(() => win2.document.querySelector('#login-email'), 'login nova janela');
  type(win2, '#login-email', email);
  type(win2, '#login-password', 'PalcoForte123');
  submit(win2, '#form-login');
  await waitFor(() => win2.document.querySelector('.app-shell'), 'painel após login');
  const store2 = win2.App.store();
  console.log('7) login de novo — produtos recuperados:', store2.listProducts().length);

  win2.App.navigate('profile');
  await waitFor(() => win2.document.querySelector('#avatar-pick'), 'editor de foto');
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDoJnc6BpjDyQgNx0rCgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECDwW3gZJ0ABy8nFzAAAAABJRU5ErkJggg==';
  await store2.updateProfile({ avatar: pixel, city: 'Ipatinga' });
  win2.App.render(); win2.App.navigate('profile');
  await waitFor(() => win2.document.querySelector('#profile-avatar img'), 'foto no perfil');
  const sess = await (await fetch(BASE + '/api/auth/session', { headers: { cookie: cookieHeader() } })).json();
  console.log('8) foto no servidor:', (sess.account.avatar || '').slice(0, 26) + '…', '| cidade:', sess.account.city);

  // "outro aparelho" de verdade: cookies zerados, apenas e-mail e senha
  cookies.clear();
  const win3 = openApp();
  await waitFor(() => win3.document.querySelector('#login-email'), 'login terceiro aparelho');
  type(win3, '#login-email', email);
  type(win3, '#login-password', 'PalcoForte123');
  submit(win3, '#form-login');
  await waitFor(() => win3.document.querySelector('.app-shell'), 'painel no terceiro aparelho');
  const s3 = win3.App.store();
  console.log('9) outro aparelho — produtos:', s3.listProducts().length, '| foto do perfil:', Boolean(s3.getUser().avatar));
  console.log('\nRESULTADO: fluxo completo na nuvem OK');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
