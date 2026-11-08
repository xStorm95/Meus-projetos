/*
 * Camada de dados do Palco.
 *
 * DOIS MODOS, mesma API (init/get/set/keys/clearAll):
 *   1. nuvem  — quando há um servidor Palco configurado: cada usuário tem seus
 *               dados no PostgreSQL do servidor, acessíveis de qualquer aparelho.
 *   2. local  — IndexedDB + espelho em localStorage (offline / arquivo único).
 *
 * O modo é decidido por `PalcoCloud.detect()`, que confere /api/health.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PassarelaDB = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DB_NAME = "passarela_erp";
  var DB_VERSION = 1;
  var STORE = "kv";
  var MIRROR_PREFIX = "passarela:kv:";

  var memory = {};
  var driver = "memory";
  var idb = null;
  var cloud = null; // cliente HTTP do servidor (quando online)

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

  /* ============================ NUVEM ============================ */

  function createCloudClient() {
    function request(path, options) {
      var opts = options || {};
      return fetch(path, {
        method: opts.method || "GET",
        headers: Object.assign({ "content-type": "application/json" }, opts.headers || {}),
        credentials: "same-origin",
        cache: "no-store",
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }).then(function (res) {
        return res
          .text()
          .then(function (text) {
            var body = null;
            try {
              body = text ? JSON.parse(text) : null;
            } catch (err) {
              body = null;
            }
            return { status: res.status, ok: res.ok, body: body || {} };
          });
      });
    }

    return {
      request: request,

      mode: function () {
        return request("/api/mode").then(function (res) {
          if (!res.ok) return null;
          return res.body;
        });
      },

      session: function () {
        return request("/api/auth/session").then(function (res) {
          return res.ok ? res.body : { authenticated: false, account: null };
        });
      },

      signup: function (payload) {
        return request("/api/auth/signup", { method: "POST", body: payload });
      },

      login: function (payload) {
        return request("/api/auth/login", { method: "POST", body: payload });
      },

      logout: function () {
        return request("/api/auth/logout", { method: "POST" });
      },

      pull: function () {
        return request("/api/state").then(function (res) {
          return res.ok ? res.body.state || {} : null;
        });
      },

      set: function (key, value) {
        return request("/api/state/" + encodeURIComponent(key), {
          method: "PUT",
          body: { value: value },
        }).then(function (res) {
          return res.ok;
        });
      },

      clearAll: function () {
        return request("/api/state", { method: "DELETE" }).then(function (res) {
          return res.ok;
        });
      },
    };
  }

  /** Tenta falar com um servidor Palco; devolve true quando online e aberto ao público. */
  async function detectServer() {
    if (typeof fetch !== "function") return false;
    try {
      var probe = await fetch("/api/health", { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (!probe.ok) return false;
      var info = await probe.json();
      if (!info || info.app !== "palco") return false;
      cloud = createCloudClient();
      return true;
    } catch (err) {
      return false;
    }
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
        resolve((req.result || []).map(String));
      };
      req.onerror = function () {
        resolve([]);
      };
    });
  }

  function idbClear() {
    return new Promise(function (resolve) {
      var tx = idb.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = function () {
        resolve(true);
      };
      tx.onerror = function () {
        resolve(false);
      };
    });
  }

  /* ============================ INIT ============================ */

  async function init() {
    var online = await detectServer();
    if (online) {
      driver = "cloud";
      return true;
    }

    idb = await openIndexedDb();
    if (idb) {
      driver = "indexeddb";
      // Recupera espelho do localStorage caso o IndexedDB tenha sido limpo.
      if (hasLocalStorage()) {
        for (var i = 0; i < localStorage.length; i++) {
          var fullKey = localStorage.key(i);
          if (!fullKey || fullKey.indexOf(MIRROR_PREFIX) !== 0) continue;
          var key = fullKey.slice(MIRROR_PREFIX.length);
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
      return true;
    }

    if (hasLocalStorage()) {
      driver = "localstorage";
      return true;
    }

    driver = "memory";
    return true;
  }

  /* ============================ GET/SET ============================ */

  async function get(key, fallback) {
    if (driver === "cloud") {
      // O servidor entrega o snapshot completo de uma vez (ver pull()).
      var snapshot = await cloud.pull();
      memory = snapshot || {};
      return memory[key] === undefined ? fallback : memory[key];
    }
    if (driver === "indexeddb") {
      var value = await idbGet(key);
      if (value !== null) return value;
      var mirror = hasLocalStorage() ? localStorage.getItem(MIRROR_PREFIX + key) : null;
      if (mirror) {
        try {
          return JSON.parse(mirror);
        } catch (err) {
          return fallback;
        }
      }
      return fallback;
    }
    if (driver === "localstorage") {
      var rawLocal = localStorage.getItem(MIRROR_PREFIX + key);
      if (!rawLocal) return fallback;
      try {
        return JSON.parse(rawLocal);
      } catch (err) {
        return fallback;
      }
    }
    return memory[key] === undefined ? fallback : memory[key];
  }

  async function set(key, value) {
    if (driver === "cloud") {
      memory[key] = value;
      return cloud.set(key, value);
    }
    if (driver === "indexeddb") {
      var ok = await idbSet(key, value);
      if (hasLocalStorage()) {
        try {
          localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
        } catch (err) {
          /* quota cheia: o IndexedDB continua sendo a fonte */
        }
      }
      return ok;
    }
    if (driver === "localstorage") {
      try {
        localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    }
    memory[key] = value;
    return true;
  }

  async function keys() {
    if (driver === "cloud") return Object.keys(memory);
    if (driver === "indexeddb") return idbKeys();
    if (driver === "localstorage") {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var full = localStorage.key(i);
        if (full && full.indexOf(MIRROR_PREFIX) === 0) out.push(full.slice(MIRROR_PREFIX.length));
      }
      return out;
    }
    return Object.keys(memory);
  }

  async function clearAll() {
    if (driver === "cloud") {
      memory = {};
      return cloud.clearAll();
    }
    if (driver === "indexeddb") {
      await idbClear();
      if (hasLocalStorage()) {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var full = localStorage.key(i);
          if (full && full.indexOf(MIRROR_PREFIX) === 0) localStorage.removeItem(full);
        }
      }
      return true;
    }
    if (driver === "localstorage") {
      for (var j = localStorage.length - 1; j >= 0; j--) {
        var key = localStorage.key(j);
        if (key && key.indexOf(MIRROR_PREFIX) === 0) localStorage.removeItem(key);
      }
      return true;
    }
    memory = {};
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
    isCloud: function () {
      return driver === "cloud";
    },
    cloud: function () {
      return cloud;
    },
  };
});
