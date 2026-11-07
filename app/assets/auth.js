/*
 * Núcleo da conta: cadastro, login, sessão persistente, perfil e foto.
 *
 * Persistência em camadas:
 *   1. IndexedDB  (principal — guarda também a foto em base64)
 *   2. localStorage (espelho/fallback — ex.: janela privada, file:// restrito)
 *   3. memória (último recurso, avisado na interface)
 *
 * A senha nunca é gravada: só o hash PBKDF2 (ver hash.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AccountStore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DB_NAME = "conta_palco";
  var STORE = "kv";
  var PREFIX = "conta:";
  var SESSION_HOURS = 24;

  var KEYS = { accounts: "accounts", session: "session" };

  /* ============================ PERSISTÊNCIA ============================ */

  function createDB() {
    var idb = null;
    var driver = "memory";
    var memory = {};

    function hasLocal() {
      try {
        localStorage.setItem("__probe__", "1");
        localStorage.removeItem("__probe__");
        return true;
      } catch (err) {
        return false;
      }
    }

    function openIDB() {
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
          var req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = function () {
            if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
          };
          req.onsuccess = function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(req.result);
          };
          req.onerror = req.onblocked = function () {
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
        try {
          var req = idb.transaction(STORE, "readonly").objectStore(STORE).get(key);
          req.onsuccess = function () {
            resolve(req.result === undefined ? null : req.result);
          };
          req.onerror = function () {
            resolve(null);
          };
        } catch (err) {
          resolve(null);
        }
      });
    }

    function idbSet(key, value) {
      return new Promise(function (resolve) {
        try {
          var tx = idb.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(value, key);
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

    function readLocal(key) {
      if (!hasLocal()) return null;
      var raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    }

    function writeLocal(key, value) {
      if (!hasLocal()) return false;
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    }

    return {
      async init() {
        idb = await openIDB();
        if (idb) {
          driver = "indexeddb";
        } else if (hasLocal()) {
          driver = "localstorage";
        } else {
          driver = "memory";
        }
        return driver;
      },
      driver: function () {
        return driver;
      },
      async get(key, fallback) {
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
      },
      async set(key, value) {
        if (driver === "indexeddb") {
          var ok = await idbSet(key, value);
          writeLocal(key, value);
          return ok;
        }
        if (driver === "localstorage") return writeLocal(key, value);
        memory[key] = value;
        return true;
      },
      async remove(key) {
        await this.set(key, null);
      }
    };
  }

  /* ============================== UTILIDADES ============================== */

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  /* ================================ STORE ================================ */

  function createStore(deps) {
    var db = deps.db;
    var hash = deps.hash;
    var core = deps.core;
    var cryptoLib = deps.crypto || (typeof crypto !== "undefined" ? crypto : null);

    var state = { accounts: [], session: null };
    var current = null;
    var listeners = [];
    var MAX_ATTEMPTS = 5;
    var LOCK_MINUTES = 15;

    function emit() {
      listeners.forEach(function (fn) {
        try {
          fn();
        } catch (err) {
          /* ignora listener com erro */
        }
      });
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) {
          return l !== fn;
        });
      };
    }

    function publicAccount(account) {
      if (!account) return null;
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        phone: account.phone,
        document: account.document,
        birthDate: account.birthDate,
        city: account.city,
        bio: account.bio,
        avatar: account.avatar,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastLoginAt: account.lastLoginAt,
        photoUpdatedAt: account.photoUpdatedAt
      };
    }

    function findAccount(email) {
      var target = core.normalizeEmail(email);
      return state.accounts.find(function (a) {
        return a.email === target;
      });
    }

    async function persistAccounts() {
      await db.set(KEYS.accounts, state.accounts);
    }

    async function load() {
      var results = await Promise.all([db.get(KEYS.accounts, []), db.get(KEYS.session, null)]);
      state.accounts = results[0] || [];
      state.session = results[1] || null;
      current = null;

      if (state.session && state.session.accountId) {
        var account = state.accounts.find(function (a) {
          return a.id === state.session.accountId;
        });
        var valid = state.session.expiresAt && new Date(state.session.expiresAt).getTime() > Date.now();
        if (account && valid) current = account;
        else {
          state.session = null;
          await db.set(KEYS.session, null);
        }
      }
      emit();
      return state;
    }

    async function startSession(account) {
      var session = {
        token: hash.randomToken(),
        accountId: account.id,
        createdAt: now(),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString()
      };
      state.session = session;
      current = account;
      await db.set(KEYS.session, session);
    }

    /* ------------------------------ CADASTRO ------------------------------ */

    async function signup(payload) {
      var emails = state.accounts.map(function (a) {
        return a.email;
      });
      var check = core.validateSignup(payload, emails);
      if (!check.valid) {
        var err = new Error("Confira os campos destacados.");
        err.fields = check.errors;
        throw err;
      }

      var passwordHash = await hash.hashPassword(payload.password);
      var account = {
        id: uid(),
        name: core.normalizeName(payload.name),
        email: core.normalizeEmail(payload.email),
        phone: payload.phone ? core.onlyDigits(payload.phone) : "",
        document: payload.document ? core.onlyDigits(payload.document) : "",
        birthDate: payload.birthDate || "",
        city: core.normalizeName(payload.city || ""),
        bio: "",
        avatar: "",
        passwordHash: passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now(),
        createdAt: now(),
        updatedAt: now(),
        photoUpdatedAt: null
      };
      state.accounts = state.accounts.concat([account]);
      await persistAccounts();
      await startSession(account);
      emit();
      return publicAccount(account);
    }

    /* -------------------------------- LOGIN ------------------------------- */

    async function login(email, password) {
      var account = findAccount(email);
      if (!account) {
        var unknown = new Error("E-mail ou senha incorretos.");
        unknown.fields = { password: "E-mail ou senha incorretos." };
        throw unknown;
      }

      if (account.lockedUntil && new Date(account.lockedUntil).getTime() > Date.now()) {
        var minutes = Math.max(1, Math.ceil((new Date(account.lockedUntil).getTime() - Date.now()) / 60000));
        var locked = new Error(
          "Sua conta foi bloqueada por segurança. Tente novamente em " + minutes + " minuto(s)."
        );
        locked.fields = { password: "Conta bloqueada temporariamente." };
        throw locked;
      }

      var ok = await hash.verifyPassword(password, account.passwordHash);
      if (!ok) {
        account.failedAttempts = Number(account.failedAttempts || 0) + 1;
        if (account.failedAttempts >= MAX_ATTEMPTS) {
          account.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
          account.failedAttempts = 0;
        }
        account.updatedAt = now();
        await persistAccounts();
        var invalid = new Error(
          account.lockedUntil
            ? "Sua conta foi bloqueada por 15 minutos após 5 tentativas incorretas."
            : "E-mail ou senha incorretos. Restam " + (MAX_ATTEMPTS - Number(account.failedAttempts || 0)) + " tentativa(s)."
        );
        invalid.fields = { password: "E-mail ou senha incorretos." };
        throw invalid;
      }

      account.failedAttempts = 0;
      account.lockedUntil = null;
      account.lastLoginAt = now();
      account.updatedAt = now();
      await persistAccounts();
      await startSession(account);
      emit();
      return publicAccount(account);
    }

    async function logout() {
      current = null;
      state.session = null;
      await db.set(KEYS.session, null);
      emit();
    }

    /* -------------------------------- PERFIL ------------------------------ */

    async function updateProfile(patch) {
      if (!current) throw new Error("Sua sessão expirou. Entre novamente.");
      var errors = {};

      var name = patch.name === undefined ? current.name : core.normalizeName(patch.name);
      if (!core.isValidName(name)) errors.name = "Informe seu nome completo.";

      var email = patch.email === undefined ? current.email : core.normalizeEmail(patch.email);
      if (!core.isValidEmail(email)) errors.email = "E-mail inválido.";
      else {
        var duplicated = state.accounts.some(function (a) {
          return a.id !== current.id && a.email === email;
        });
        if (duplicated) errors.email = "Este e-mail já pertence a outra conta.";
      }

      if (patch.document) {
        if (!core.isValidCPF(patch.document)) errors.document = "CPF inválido.";
      }
      if (patch.phone && !core.isValidPhone(patch.phone)) errors.phone = "Telefone incompleto.";

      if (Object.keys(errors).length) {
        var err = new Error("Confira os campos destacados.");
        err.fields = errors;
        throw err;
      }

      var updated = Object.assign({}, current, {
        name: name,
        email: email,
        phone: patch.phone === undefined ? current.phone : core.onlyDigits(patch.phone),
        document: patch.document === undefined ? current.document : core.onlyDigits(patch.document),
        birthDate: patch.birthDate === undefined ? current.birthDate : patch.birthDate,
        city: patch.city === undefined ? current.city : core.normalizeName(patch.city),
        bio: patch.bio === undefined ? current.bio : String(patch.bio).slice(0, 300),
        updatedAt: now()
      });

      state.accounts = state.accounts.map(function (a) {
        return a.id === updated.id ? updated : a;
      });
      current = updated;
      await persistAccounts();
      emit();
      return publicAccount(updated);
    }

    /** Salva a foto (data URL já redimensionada) do jeito mais seguro possível. */
    async function savePhoto(dataUrl) {
      if (!current) throw new Error("Sua sessão expirou. Entre novamente.");
      if (!dataUrl || !/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) {
        throw new Error("Formato de imagem não aceito.");
      }
      if (dataUrl.length > 900 * 1024) throw new Error("Imagem muito grande. Tente outra foto.");

      var updated = Object.assign({}, current, {
        avatar: dataUrl,
        photoUpdatedAt: now(),
        updatedAt: now()
      });
      state.accounts = state.accounts.map(function (a) {
        return a.id === updated.id ? updated : a;
      });
      current = updated;
      await persistAccounts();

      // Confirma que realmente persistiu (IndexedDB + espelho).
      var stored = await db.get(KEYS.accounts, []);
      var saved = (stored || []).find(function (a) {
        return a.id === updated.id;
      });
      emit();
      return { saved: Boolean(saved && saved.avatar === dataUrl), account: publicAccount(updated) };
    }

    async function clearPhoto() {
      if (!current) throw new Error("Sua sessão expirou. Entre novamente.");
      var updated = Object.assign({}, current, { avatar: "", photoUpdatedAt: null, updatedAt: now() });
      state.accounts = state.accounts.map(function (a) {
        return a.id === updated.id ? updated : a;
      });
      current = updated;
      await persistAccounts();
      emit();
      return publicAccount(updated);
    }

    async function changePassword(currentPassword, newPassword, confirmPassword) {
      if (!current) throw new Error("Sua sessão expirou. Entre novamente.");
      var fields = {};
      var ok = await hash.verifyPassword(currentPassword, current.passwordHash);
      if (!ok) fields.currentPassword = "A senha atual está incorreta.";
      var error = core.validatePassword(newPassword);
      if (error) fields.newPassword = error;
      if (newPassword !== confirmPassword) fields.confirmPassword = "As senhas não conferem.";
      if (Object.keys(fields).length) {
        var err = new Error("Confira os campos destacados.");
        err.fields = fields;
        throw err;
      }
      var updated = Object.assign({}, current, {
        passwordHash: await hash.hashPassword(newPassword),
        updatedAt: now()
      });
      state.accounts = state.accounts.map(function (a) {
        return a.id === updated.id ? updated : a;
      });
      current = updated;
      await persistAccounts();
      emit();
      return true;
    }

    async function deleteAccount(password) {
      if (!current) throw new Error("Sua sessão expirou.");
      var ok = await hash.verifyPassword(password, current.passwordHash);
      if (!ok) {
        var err = new Error("Senha incorreta.");
        err.fields = { password: "Senha incorreta." };
        throw err;
      }
      state.accounts = state.accounts.filter(function (a) {
        return a.id !== current.id;
      });
      await persistAccounts();
      await logout();
      return true;
    }

    /* ------------------------------ CONSULTAS ----------------------------- */

    function currentAccount() {
      return publicAccount(current);
    }

    function isAuthenticated() {
      return Boolean(current);
    }

    function listEmails() {
      return state.accounts.map(function (a) {
        return a.email;
      });
    }

    function accountCount() {
      return state.accounts.length;
    }

    function storageEstimate() {
      try {
        var total = 0;
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.indexOf(PREFIX) === 0) total += (localStorage.getItem(key) || "").length + key.length;
        }
        if (total < 1024) return total + " B";
        if (total < 1024 * 1024) return (total / 1024).toFixed(1) + " KB";
        return (total / 1024 / 1024).toFixed(2) + " MB";
      } catch (err) {
        return "—";
      }
    }

    function hasSupport() {
      return Boolean(cryptoLib && cryptoLib.subtle);
    }

    return {
      load: load,
      subscribe: subscribe,
      getState: function () {
        return state;
      },
      currentAccount: currentAccount,
      isAuthenticated: isAuthenticated,
      signup: signup,
      login: login,
      logout: logout,
      updateProfile: updateProfile,
      savePhoto: savePhoto,
      removePhoto: clearPhoto,
      changePassword: changePassword,
      deleteAccount: deleteAccount,
      listEmails: listEmails,
      accountCount: accountCount,
      storageEstimate: storageEstimate,
      hasSupport: hasSupport,
      driver: function () {
        return db.driver();
      }
    };
  }

  return { createStore: createStore, createDB: createDB, KEYS: KEYS };
});
