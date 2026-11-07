/*
 * Camada de dados do aplicativo.
 *
 * Persistência: IndexedDB (primário, sem limite prático para fotos) com
 * espelhamento automático em localStorage (fallback para navegadores em que o
 * IndexedDB está bloqueado, ex.: modo privado de alguns navegadores).
 *
 * Tudo fica salvo NO DISPOSITIVO do usuário. Ao fechar e reabrir o site, ou
 * desligar o computador, os dados continuam lá.
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

  async function init() {
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
      return driver;
    }
    driver = hasLocalStorage() ? "localstorage" : "memory";
    return driver;
  }

  function readLocal(key) {
    if (!hasLocalStorage()) return null;
    var raw = localStorage.getItem(MIRROR_PREFIX + key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function writeLocal(key, value) {
    if (!hasLocalStorage()) return false;
    try {
      localStorage.setItem(MIRROR_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  async function get(key, fallback) {
    var value = null;
    if (driver === "indexeddb") {
      value = await idbGet(key);
      if (value === null) value = readLocal(key);
    } else if (driver === "localstorage") {
      value = readLocal(key);
    } else {
      value = Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
    return value === null || value === undefined ? fallback : value;
  }

  async function set(key, value) {
    if (driver === "indexeddb") {
      var ok = await idbSet(key, value);
      writeLocal(key, value); // espelho / fallback
      return ok;
    }
    if (driver === "localstorage") return writeLocal(key, value);
    memory[key] = value;
    return true;
  }

  async function keys() {
    if (driver === "indexeddb") {
      var list = await idbKeys();
      if (list.length) return list;
      return Object.keys(memory);
    }
    if (driver === "localstorage" && hasLocalStorage()) {
      var out = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(MIRROR_PREFIX) === 0) out.push(k.slice(MIRROR_PREFIX.length));
      }
      return out;
    }
    return Object.keys(memory);
  }

  /** Remove todas as chaves do aplicativo (usado em "apagar tudo"). */
  async function clearAll() {
    var all = await keys();
    for (var i = 0; i < all.length; i++) await set(all[i], null);
    if (driver === "indexeddb" && idb) {
      await new Promise(function (resolve) {
        var tx = idb.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }
    if (hasLocalStorage()) {
      var toRemove = [];
      for (var j = 0; j < localStorage.length; j++) {
        var fullKey = localStorage.key(j);
        if (fullKey && fullKey.indexOf(MIRROR_PREFIX) === 0) toRemove.push(fullKey);
      }
      toRemove.forEach(function (k) {
        localStorage.removeItem(k);
      });
    }
    memory = {};
  }

  return {
    init: init,
    get: get,
    set: set,
    keys: keys,
    clearAll: clearAll,
    driver: function () {
      return driver;
    }
  };
});
