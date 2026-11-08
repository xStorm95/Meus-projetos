/**
 * Teste do salvamento em ARQUIVO no computador (File System Access API).
 * Simula o disco com um arquivo real em /tmp e confere que produtos, clientes
 * e a foto de perfil são gravados e relidos.
 *
 *   node web/tests/file.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML = fs.readFileSync(path.join(__dirname, "..", "dist", "palco.html"), "utf8");
const FILE = path.join(os.tmpdir(), "passarela-teste-" + process.pid + ".json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (fn()) return true;
    } catch (err) {
      /* tenta de novo */
    }
    await sleep(50);
  }
  throw new Error("Timeout aguardando: " + label);
}

/** Handle falso que grava de verdade em FILE. */
function fakePicker() {
  return async () => ({
    name: path.basename(FILE),
    kind: "file",
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    getFile: async () => ({ text: async () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "") }),
    createWritable: async () => ({
      write: async (text) => fs.writeFileSync(FILE, text, "utf8"),
      close: async () => {},
    }),
  });
}

function openWindow() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (err) => {
    if (!/Not implemented/.test(err.message)) errors.push(err);
  });
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "http://localhost/",
    virtualConsole,
  });
  dom.window.showSaveFilePicker = fakePicker();
  return { win: dom.window, errors };
}

test("grava produtos, clientes e foto em um arquivo do computador", async () => {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  const { win, errors } = openWindow();
  await waitFor(() => win.document.querySelector(".app-shell"), "app abrindo");

  // 1. o programa oferece vincular um arquivo
  assert.ok(win.document.querySelector('[data-action="link-file"]'), "botão de escolher arquivo");
  assert.equal(win.PassarelaDB.fileInfo().linked, false);

  // 2. usuário escolhe o arquivo
  win.document
    .querySelector('[data-action="link-file"]')
    .dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
  await waitFor(() => win.PassarelaDB.fileInfo().linked, "arquivo vinculado");
  assert.ok(fs.existsSync(FILE), "arquivo criado no disco");

  // 3. dados são gravados sozinhos
  const store = win.App.store();
  await store.saveProduct({ name: "Vestido Midi", price: 249.9, cost: 90, stock: 4, category: "Vestidos", size: "M" });
  await store.saveCustomer({ name: "Maria Souza", phone: "31999998888" });
  const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOklEQVR42u3OMQEAAAgDoJnc6BpjDyQgNx0rCgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECDwW3gZJ0ABy8nFzAAAAABJRU5ErkJggg==";
  await store.updateProfile({ avatar: photo, city: "Ipatinga" });
  await waitFor(() => {
    if (!fs.existsSync(FILE)) return false;
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return parsed.data && parsed.data.products && parsed.data.products.length === 1;
  }, "produto gravado no arquivo");

  const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
  assert.equal(saved.app, "Passarela da Moda");
  assert.equal(saved.format, "passarela-backup");
  assert.equal(saved.data.products[0].name, "Vestido Midi");
  assert.equal(saved.data.products[0].price, 249.9);
  assert.equal(saved.data.customers[0].name, "Maria Souza");
  assert.equal(saved.data.settings.profile.avatar, photo, "foto de perfil vai para o arquivo");

  // 4. backup contém tudo
  const dump = await store.exportAll();
  assert.equal(dump.products.length, 1);
  assert.equal(dump.customers.length, 1);

  // 5. abrir o programa num navegador limpo e escolher o MESMO arquivo recupera os dados
  const segundo = openWindow();
  await waitFor(() => segundo.win.document.querySelector(".app-shell"), "app no segundo navegador");
  const resultado = await segundo.win.PassarelaDB.linkFile();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.merged, true, "os dados do arquivo entram no programa");
  assert.equal(resultado.entries, 1);

  await segundo.win.App.store().refresh();
  segundo.win.App.render();
  assert.equal(segundo.win.App.store().listProducts()[0].name, "Vestido Midi");
  assert.equal(segundo.win.App.store().getUser().avatar, photo);

  assert.deepEqual(errors, [], "sem erros de script");
  fs.unlinkSync(FILE);
});

test("sem suporte a arquivo, oferece o download do backup", async () => {
  const { win } = openWindow();
  win.showSaveFilePicker = undefined;
  await waitFor(() => win.document.querySelector(".app-shell"), "app abrindo");
  await win.PassarelaDB.init();

  win.App.render();
  assert.ok(win.document.querySelector('[data-action="download-backup"]'), "aviso para baixar o backup");
});
