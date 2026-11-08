/*
 * Passarela da Moda — camada de dados OFFLINE.
 *
 * Tudo fica salvo em DOIS lugares, sempre:
 *   1. no navegador (IndexedDB) — para o app abrir sozinho ao reabrir;
 *   2. no COMPUTADOR, em um arquivo do próprio programa — com a File System
 *      Access API o usuário escolhe/escolhe a pasta uma vez e as gravações
 *      passam a ser escritas direto em disco (backup automático).
 *
 * Nada é enviado para nenhum servidor. Sem contas, sem senhas, sem internet.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PassarelaDB = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DB_NAME = "passarela_moda";
  var DB_VERSION = 1;
  var STORE = "kv";
  var MIRROR_PREFIX = "passarela:kv:";
  var HANDLE_KEY = "passarela:file-handle";

  var memory = {};
  var driver = "memory";
  var idb = null;
  var fileHandle = null; // FileSystemFileHandle (quando o usuário vinculou um arquivo)
  var fileStatus = "off"; // off | ready | error
  var saveTimer = null;
  var pendingSave = false;

  function hasLocalStorage() {
    try {
      var probe = "__probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ===================== ARQUIVO NO COMPUTADOR ===================== */

  function fileApiAvailable() {
    return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
  }

  /** Guarda a referência do arquivo no IndexedDB (o handle não cabe no localStorage). */
  function idbSaveHandle(handle) {
    return new Promise(function (resolve) {
      if (!idb) return resolve(false);
      try {
        var tx = idb.transaction(STORE, "readwrite");
        var req = tx.objectStore(STORE).put(handle, HANDLE_KEY);
        req.onsuccess = function () {
          resolve(true);
        };
        req.onerror = function () {
          resolve(false);
        };
      } catch (err) {
        resolve(false);
      }
    });
  }

  function idbLoadHandle() {
    return new Promise(function (resolve) {
      if (!idb) return resolve(null);
      try {
        var tx = idb.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).get(HANDLE_KEY);
        req.onsuccess = function () {
          resolve(req.result && typeof req.result.createWritable === "function" ? req.result : null);
        };
        req.onerror = function () {
          resolve(null);
        };
      } catch (err) {
        resolve(null);
      }
    });
  }

  function idbClearHandle() {
    return new Promise(function (resolve) {
      if (!idb) return resolve(true);
      try {
        var tx = idb.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(HANDLE_KEY);
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          resolve(false);
        };
      } catch (err) {
        resolve(false);
      }
    });
  }

  /** Conteúdo completo do arquivo de dados (.passarela.json). */
  function snapshot() {
    return {
      app: "Passarela da Moda",
      format: "passarela-backup",
      version: 1,
      savedAt: new Date().toISOString(),
      data: memory,
    };
  }

  async function writeFile() {
    if (!fileHandle) return false;
    try {
      var text = JSON.stringify(snapshot(), null, 2);
      var writable = await fileHandle.createWritable();
      await writable.write(text);
      await writable.close();
      // mantém uma cópia em memória do último texto gravado
      memory.__lastSavedAt = new Date().toISOString();
      fileStatus = "ready";
      return true;
    } catch (err) {
      fileStatus = "error";
      return false;
    }
  }

  /** Grava no arquivo, agrupando várias chamadas seguidas numa só escrita. */
  function scheduleFileWrite() {
    if (!fileHandle) return;
    pendingSave = true;
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (!pendingSave) return;
      pendingSave = false;
      writeFile();
    }, 400);
  }

  /** Usuário escolhe (ou cria) o arquivo de dados. Precisa de um clique. */
  async function linkFile(suggestedName) {
    if (!fileApiAvailable()) {
      return { ok: false, reason: "unsupported" };
    }
    try {
      var handle = await window.showSaveFilePicker({
        suggestedName: suggestedName || "passarela-da-moda.passarela.json",
        types: [{ description: "Dados da Passarela da Moda", accept: { "application/json": [".json"] } }],
      });
      fileHandle = handle;
      await idbSaveHandle(handle);

      // Se o arquivo escolhido já tem dados (ex.: backup de outro computador) e
      // aqui está vazio, os dados do arquivo entram para o programa.
      var read = await readFileHandle();
      var fileProducts = read && read.data && read.data.products ? read.data.products.length : 0;
      var localProducts = (memory.products || []).length;
      var merged = false;

      if (fileProducts > 0 && fileProducts >= localProducts) {
        memory = Object.assign({}, memory, read.data);
        await localSet("products", memory.products || []);
        await localSet("customers", memory.customers || []);
        await localSet("sales", memory.sales || []);
        await localSet("expenses", memory.expenses || []);
        if (memory.settings) await localSet("settings", memory.settings);
        merged = true;
      } else {
        await writeFile();
      }

      return { ok: true, name: handle.name, mode: "create", merged: merged, entries: fileProducts };
    } catch (err) {
      if (err && err.name === "AbortError") return { ok: false, reason: "cancelled" };
      return { ok: false, reason: "error", message: err && err.message };
    }
  }

  /** Reabre o arquivo vinculado anteriormente (pode exigir permissão). */
  async function reopenLinkedFile(requestPermission) {
    if (!fileApiAvailable()) return { ok: false, reason: "unsupported" };
    var handle = await idbLoadHandle();
    if (!handle) return { ok: false, reason: "none" };

    var permission = "granted";
    if (handle.queryPermission) permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      if (!requestPermission) return { ok: false, reason: "permission" };
      permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") return { ok: false, reason: "permission" };
    }

    fileHandle = handle;
    fileStatus = "ready";

    // o arquivo é a fonte da verdade: o que existe nele entra para o navegador
    var localEmpty = !memory.products || memory.products.length === 0;
    var read = await readFileHandle();
    var restored = false;

    if (read && read.data && (read.data.products || []).length) {
      var localCount = (memory.products || []).length;
      var fileCount = (read.data.products || []).length;
      if (localEmpty || fileCount > localCount) {
        memory = Object.assign({}, memory, read.data);
        await localSet("products", memory.products || []);
        await localSet("customers", memory.customers || []);
        await localSet("sales", memory.sales || []);
        await localSet("expenses", memory.expenses || []);
        if (memory.settings) await localSet("settings", memory.settings);
        restored = true;
      }
    }
    if (!restored) await writeFile();

    return { ok: true, name: handle.name, restored: restored, entries: (read && read.data && (read.data.products || []).length) || 0 };
  }

  async function readFileHandle() {
    if (!fileHandle) return null;
    try {
      var file = await fileHandle.getFile();
      var text = await file.text();
      if (!text) return { data: {} };
      var parsed = JSON.parse(text);
      if (parsed && parsed.format === "passarela-backup" && parsed.data) return parsed;
      if (parsed && parsed.products) return { data: parsed };
      return { data: {} };
    } catch (err) {
      return null;
    }
  }

  async function unlinkFile() {
    fileHandle = null;
    fileStatus = "off";
    await idbClearHandle();
    return true;
  }

  /** Grava uma chave no armazenamento local (IndexedDB + espelho), se existir. */
  async function localSet(key, value) {
    memory[key] = value;
    if (driver === "indexeddb" && idb) {
      await idbSet(key, value);
      if (hasLocalStorage()) {
        try {
          localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
        } catch (err) {
          /* quota cheia: IndexedDB já salvou */
        }
      }
      return true;
    }
    if (hasLocalStorage()) {
      try {
        localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    }
    return true;
  }

  /* ========================== INDEXEDDB ========================== */

  function openIndexedDb() {
    return new Promise(function (resolve) {
      if (typeof indexedDB === "undefined") return resolve(null);
      var settled = false;
      var timer = setTimeout(function () {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 4000);
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var database = req.result;
          if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
        };
        req.onsuccess = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        };
        req.onblocked = function () {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(null);
        };
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
    });
  }

  function idbGet(key) {
    return new Promise(function (resolve) {
      var tx = idb.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () {
        resolve(req.result === undefined ? null : req.result);
      };
      req.onerror = function () {
        resolve(null);
      };
    });
  }

  function idbSet(key, value) {
    return new Promise(function (resolve) {
      var tx = idb.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = function () {
        resolve(true);
      };
      tx.onerror = function () {
        resolve(false);
      };
    });
  }

  function idbKeys() {
    return new Promise(function (resolve) {
      var tx = idb.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = function () {
        resolve((req.result || []).filter(function (k) {
          return typeof k === "string" && k.indexOf("__") !== 0 && k !== HANDLE_KEY;
        }));
      };
      req.onerror = function () {
        resolve([]);
      };
    });
  }

  function idbClear() {
    return new Promise(function (resolve) {
      var ids = [];
      var tx = idb.transaction(STORE, "readwrite");
      tx.objectStore(STORE).getAllKeys().onsuccess = function (event) {
        ids = event.target.result || [];
      };
      tx.oncomplete = function () {
        var tx2 = idb.transaction(STORE, "readwrite");
        ids.forEach(function (key) {
          if (key === HANDLE_KEY) return;
          tx2.objectStore(STORE).delete(key);
        });
        tx2.oncomplete = function () {
          resolve(true);
        };
        tx2.onerror = function () {
          resolve(false);
        };
      };
      tx.onerror = function () {
        resolve(false);
      };
    });
  }

  /* ============================ INIT ============================ */

  async function init() {
    idb = await openIndexedDb();

    if (idb) {
      driver = "indexeddb";
      if (hasLocalStorage()) {
        for (var i = 0; i < localStorage.length; i++) {
          var fullKey = localStorage.key(i);
          if (!fullKey || fullKey.indexOf(MIRROR_PREFIX) !== 0) continue;
          var key = fullKey.slice(MIRROR_PREFIX.length);
          if (key === HANDLE_KEY || key.indexOf("__") === 0) continue;
          var raw = localStorage.getItem(fullKey);
          if (!raw) continue;
          var existing = await idbGet(key);
          if (existing === null) {
            try {
              await idbSet(key, JSON.parse(raw));
            } catch (err) {
              /* espelho corrompido: ignora */
            }
          }
        }
      }
    } else if (hasLocalStorage()) {
      driver = "localstorage";
    } else {
      driver = "memory";
    }

    // tenta reabrir o arquivo já vinculado (sem pedir permissão na abertura)
    var reopen = await reopenLinkedFile(false);
    if (reopen.ok && reopen.restored) {
      // dados vieram do arquivo: o app recarrega do IndexedDB em seguida
      driver = driver || "indexeddb";
    }
    return true;
  }

  /* ============================ GET/SET ============================ */

  async function get(key, fallback) {
    var value = null;
    if (driver === "indexeddb") {
      value = await idbGet(key);
    }
    if (value && typeof value === "object" && value.__passarelaHandle) value = null;

    if (value === null && hasLocalStorage()) {
      var mirror = localStorage.getItem(MIRROR_PREFIX + key);
      if (mirror) {
        try {
          value = JSON.parse(mirror);
        } catch (err) {
          value = null;
        }
      }
    }
    if (value === null && driver === "memory") {
      value = memory[key] === undefined ? null : memory[key];
    }
    if (value === null && fileHandle) {
      var fromFile = await readFileHandle();
      if (fromFile && fromFile.data && fromFile.data[key] !== undefined) value = fromFile.data[key];
    }
    if (value === null) return fallback;
    memory[key] = value;
    return value;
  }

  async function set(key, value) {
    if (key === HANDLE_KEY || key === "__lastSavedAt") return false;
    memory[key] = value;

    var ok = true;
    if (driver === "indexeddb") {
      ok = await idbSet(key, value);
      if (hasLocalStorage()) {
        try {
          localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
        } catch (err) {
          /* quota cheia: IndexedDB já salvou */
        }
      }
    } else if (driver === "localstorage") {
      try {
        localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
      } catch (err) {
        ok = false;
      }
    }

    scheduleFileWrite();
    return ok;
  }

  async function keys() {
    if (driver === "indexeddb") return idbKeys();
    if (driver === "localstorage") {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var full = localStorage.key(i);
        if (full && full.indexOf(MIRROR_PREFIX) === 0 && full.indexOf("__") === -1) {
          out.push(full.slice(MIRROR_PREFIX.length));
        }
      }
      return out;
    }
    return Object.keys(memory);
  }

  async function clearAll() {
    memory = {};
    if (driver === "indexeddb") {
      await idbClear();
      if (hasLocalStorage()) {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var full = localStorage.key(i);
          if (full && full.indexOf(MIRROR_PREFIX) === 0 && full.indexOf("__") === -1) localStorage.removeItem(full);
        }
      }
    } else if (driver === "localstorage") {
      for (var j = localStorage.length - 1; j >= 0; j--) {
        var key = localStorage.key(j);
        if (key && key.indexOf(MIRROR_PREFIX) === 0) localStorage.removeItem(key);
      }
    }
    scheduleFileWrite();
    return true;
  }

  return {
    init: init,
    get: get,
    set: set,
    keys: keys,
    clearAll: clearAll,
    driver: function () {
      return driver;
    },
    /* arquivo no computador */
    fileSupported: fileApiAvailable,
    linkFile: linkFile,
    reopenFile: reopenLinkedFile,
    unlinkFile: unlinkFile,
    saveNow: writeFile,
    fileInfo: function () {
      return {
        linked: Boolean(fileHandle),
        name: fileHandle ? fileHandle.name : null,
        status: fileStatus,
      };
    },
    snapshot: snapshot,
  };
});
