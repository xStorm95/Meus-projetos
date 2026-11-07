/*
 * Store do aplicativo: autenticação, sessão persistente e CRUD.
 * Recebe as dependências (db, hash, core) por injeção, o que permite testar
 * toda a lógica no Node com um banco em memória.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PassarelaStore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var KEYS = {
    users: "users",
    session: "session",
    products: "products",
    customers: "customers",
    sales: "sales",
    expenses: "expenses",
    settings: "settings",
    meta: "meta"
  };

  var SESSION_HOURS = 12;

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function createStore(deps) {
    var db = deps.db;
    var hash = deps.hash;
    var core = deps.core;
    var state = {
      users: [],
      products: [],
      customers: [],
      sales: [],
      expenses: [],
      settings: {},
      session: null
    };
    var loaded = false;
    var currentUser = null;
    var listeners = [];

    function emit() {
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i]();
        } catch (err) {
          /* um listener quebrado não derruba os outros */
        }
      }
    }

    function subscribe(fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) {
          return l !== fn;
        });
      };
    }

    function defaultSettings() {
      return {
        storeName: "Minha Loja",
        ownerName: "",
        document: "",
        phone: "",
        email: "",
        address: "",
        accent: "gold",
        theme: "light",
        lowStockThreshold: 3,
        createdAt: now()
      };
    }

    async function persist(key, value) {
      state[key] = value;
      await db.set(key, value);
      emit();
    }

    async function load() {
      var results = await Promise.all([
        db.get(KEYS.users, []),
        db.get(KEYS.products, []),
        db.get(KEYS.customers, []),
        db.get(KEYS.sales, []),
        db.get(KEYS.expenses, []),
        db.get(KEYS.settings, null),
        db.get(KEYS.session, null)
      ]);
      state.users = results[0] || [];
      state.products = results[1] || [];
      state.customers = results[2] || [];
      state.sales = results[3] || [];
      state.expenses = results[4] || [];
      state.settings = results[5] || defaultSettings();
      state.session = results[6] || null;
      if (!results[5]) await db.set(KEYS.settings, state.settings);
      loaded = true;

      // Restaura a sessão se ainda for válida — é isto que mantém o usuário
      // logado depois de fechar o navegador.
      if (state.session && state.session.expiresAt && new Date(state.session.expiresAt).getTime() > Date.now()) {
        currentUser = state.users.find(function (u) {
          return u.id === state.session.userId;
        }) || null;
        if (!currentUser) state.session = null;
      } else if (state.session) {
        state.session = null;
        await db.set(KEYS.session, null);
      }
      emit();
      return state;
    }

    async function ensureLoaded() {
      if (!loaded) await load();
    }

    /* ---------------------------- AUTH ---------------------------- */

    async function signup(payload) {
      await ensureLoaded();
      var validation = core.validateSignup(payload, state.users);
      if (!validation.valid) {
        var err = new Error("Dados inválidos");
        err.fields = validation.errors;
        throw err;
      }
      var isFirst = state.users.length === 0;
      var passwordHash = await hash.hashPassword(payload.password);
      var user = {
        id: uid(),
        name: String(payload.name).trim(),
        email: String(payload.email).trim().toLowerCase(),
        passwordHash: passwordHash,
        role: isFirst ? "admin" : "membro",
        document: payload.document ? core.onlyDigits(payload.document) : "",
        phone: payload.phone ? core.onlyDigits(payload.phone) : "",
        birthDate: payload.birthDate || "",
        city: payload.city || "",
        bio: "",
        avatar: "",
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        createdAt: now(),
        updatedAt: now()
      };
      state.users = state.users.concat([user]);
      await db.set(KEYS.users, state.users);
      if (isFirst && !state.settings.ownerName) {
        state.settings.ownerName = user.name;
        await db.set(KEYS.settings, state.settings);
      }
      await startSession(user);
      emit();
      return publicUser(user);
    }

    async function startSession(user) {
      var session = {
        token: hash.randomToken(),
        userId: user.id,
        createdAt: now(),
        expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
      };
      state.session = session;
      currentUser = user;
      await db.set(KEYS.session, session);
    }

    async function login(email, password) {
      await ensureLoaded();
      var target = String(email || "").trim().toLowerCase();
      var user = state.users.find(function (u) {
        return String(u.email || "").toLowerCase() === target;
      });
      if (!user) {
        var notFound = new Error("E-mail ou senha incorretos.");
        notFound.code = "INVALID";
        throw notFound;
      }
      if (core.isLocked(user)) {
        var locked = new Error(
          "Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em alguns minutos."
        );
        locked.code = "LOCKED";
        throw locked;
      }
      var ok = await hash.verifyPassword(password, user.passwordHash);
      if (!ok) {
        var attempt = core.registerFailedAttempt(user);
        user.failedAttempts = attempt.failedAttempts;
        user.lockedUntil = attempt.lockedUntil;
        user.updatedAt = now();
        state.users = state.users.map(function (u) {
          return u.id === user.id ? user : u;
        });
        await db.set(KEYS.users, state.users);
        var invalid = new Error(
          user.lockedUntil
            ? "Muitas tentativas inválidas. A conta ficou bloqueada por 15 minutos."
            : "E-mail ou senha incorretos."
        );
        invalid.code = "INVALID";
        throw invalid;
      }
      var reset = core.resetAttempts();
      user.failedAttempts = reset.failedAttempts;
      user.lockedUntil = reset.lockedUntil;
      user.lastLoginAt = now();
      user.updatedAt = now();
      state.users = state.users.map(function (u) {
        return u.id === user.id ? user : u;
      });
      await db.set(KEYS.users, state.users);
      await startSession(user);
      emit();
      return publicUser(user);
    }

    async function logout() {
      state.session = null;
      currentUser = null;
      await db.set(KEYS.session, null);
      emit();
    }

    function publicUser(user) {
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        document: user.document,
        phone: user.phone,
        birthDate: user.birthDate,
        city: user.city,
        bio: user.bio,
        avatar: user.avatar,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      };
    }

    function getUser() {
      return publicUser(currentUser);
    }

    async function updateProfile(patch) {
      await ensureLoaded();
      if (!currentUser) throw new Error("Sessão expirada. Faça login novamente.");
      var errors = {};
      var name = patch.name !== undefined ? String(patch.name).trim() : currentUser.name;
      if (name.length < 3) errors.name = "Informe seu nome completo.";
      var email = patch.email !== undefined ? String(patch.email).trim().toLowerCase() : currentUser.email;
      if (!core.isValidEmail(email)) errors.email = "E-mail inválido.";
      var duplicated = state.users.some(function (u) {
        return u.id !== currentUser.id && String(u.email).toLowerCase() === email;
      });
      if (duplicated) errors.email = "Este e-mail já pertence a outra conta.";
      if (patch.document) {
        var digits = core.onlyDigits(patch.document);
        if (digits.length === 11 && !core.isValidCPF(digits)) errors.document = "CPF inválido.";
        if (digits.length === 14 && !core.isValidCNPJ(digits)) errors.document = "CNPJ inválido.";
      }
      if (Object.keys(errors).length) {
        var err = new Error("Dados inválidos");
        err.fields = errors;
        throw err;
      }
      var updated = Object.assign({}, currentUser, {
        name: name,
        email: email,
        document: patch.document !== undefined ? core.onlyDigits(patch.document) : currentUser.document,
        phone: patch.phone !== undefined ? core.onlyDigits(patch.phone) : currentUser.phone,
        birthDate: patch.birthDate !== undefined ? patch.birthDate : currentUser.birthDate,
        city: patch.city !== undefined ? patch.city : currentUser.city,
        bio: patch.bio !== undefined ? String(patch.bio).slice(0, 280) : currentUser.bio,
        avatar: patch.avatar !== undefined ? patch.avatar : currentUser.avatar,
        updatedAt: now()
      });
      state.users = state.users.map(function (u) {
        return u.id === updated.id ? updated : u;
      });
      currentUser = updated;
      await db.set(KEYS.users, state.users);
      emit();
      return publicUser(updated);
    }

    async function changePassword(currentPassword, newPassword) {
      await ensureLoaded();
      if (!currentUser) throw new Error("Sessão expirada.");
      var ok = await hash.verifyPassword(currentPassword, currentUser.passwordHash);
      if (!ok) {
        var err = new Error("A senha atual está incorreta.");
        err.fields = { currentPassword: "Senha atual incorreta." };
        throw err;
      }
      var strength = core.validatePasswordStrength(newPassword);
      if (strength) {
        var weak = new Error(strength);
        weak.fields = { newPassword: strength };
        throw weak;
      }
      var newHash = await hash.hashPassword(newPassword);
      var updated = Object.assign({}, currentUser, { passwordHash: newHash, updatedAt: now() });
      state.users = state.users.map(function (u) {
        return u.id === updated.id ? updated : u;
      });
      currentUser = updated;
      await db.set(KEYS.users, state.users);
      emit();
      return true;
    }

    /* -------------------------- PRODUTOS -------------------------- */

    async function saveProduct(payload) {
      await ensureLoaded();
      if (!currentUser) throw new Error("Sessão expirada.");
      var name = String(payload.name || "").trim();
      if (name.length < 2) {
        var err = new Error("Informe o nome do produto.");
        err.fields = { name: "Informe o nome do produto." };
        throw err;
      }
      var price = Number(payload.price);
      if (!isFinite(price) || price < 0) {
        var priceErr = new Error("Preço inválido.");
        priceErr.fields = { price: "Informe um preço válido." };
        throw priceErr;
      }
      var stock = payload.stock === "" || payload.stock === undefined ? 0 : Number(payload.stock);
      if (!isFinite(stock) || stock < 0) {
        var stockErr = new Error("Estoque inválido.");
        stockErr.fields = { stock: "O estoque não pode ser negativo." };
        throw stockErr;
      }

      if (payload.id) {
        var existing = state.products.find(function (p) {
          return p.id === payload.id;
        });
        if (!existing) throw new Error("Produto não encontrado.");
        var updated = Object.assign({}, existing, {
          name: name,
          sku: String(payload.sku || existing.sku || "").trim().toUpperCase(),
          category: payload.category || existing.category,
          color: payload.color || "",
          size: payload.size || "",
          price: core.round2(price),
          cost: core.round2(Number(payload.cost) || 0),
          stock: Math.round(stock),
          photo: payload.photo !== undefined ? payload.photo : existing.photo,
          description: payload.description !== undefined ? payload.description : existing.description,
          updatedAt: now()
        });
        state.products = state.products.map(function (p) {
          return p.id === updated.id ? updated : p;
        });
        await persist("products", state.products);
        return updated;
      }

      var product = {
        id: uid(),
        name: name,
        sku: String(payload.sku || "").trim().toUpperCase() || "SKU-" + String(Date.now()).slice(-6),
        category: payload.category || "Outros",
        color: payload.color || "",
        size: payload.size || "",
        price: core.round2(price),
        cost: core.round2(Number(payload.cost) || 0),
        stock: Math.round(stock),
        photo: payload.photo || "",
        description: payload.description || "",
        active: true,
        createdAt: now(),
        updatedAt: now(),
        createdBy: currentUser.id
      };
      state.products = state.products.concat([product]);
      await persist("products", state.products);
      return product;
    }

    async function deleteProduct(id) {
      await ensureLoaded();
      state.products = state.products.filter(function (p) {
        return p.id !== id;
      });
      await persist("products", state.products);
      return true;
    }

    async function adjustStock(id, delta, reason) {
      await ensureLoaded();
      var product = state.products.find(function (p) {
        return p.id === id;
      });
      if (!product) throw new Error("Produto não encontrado.");
      var next = product.stock + Math.trunc(Number(delta) || 0);
      if (next < 0) throw new Error("O estoque não pode ficar negativo.");
      product.stock = next;
      product.updatedAt = now();
      state.products = state.products.map(function (p) {
        return p.id === product.id ? product : p;
      });
      state.meta = state.meta || {};
      await persist("products", state.products);
      void reason;
      return product;
    }

    /* -------------------------- CLIENTES -------------------------- */

    async function saveCustomer(payload) {
      await ensureLoaded();
      var name = String(payload.name || "").trim();
      if (name.length < 3) {
        var err = new Error("Informe o nome do cliente.");
        err.fields = { name: "Informe o nome do cliente." };
        throw err;
      }
      if (payload.document) {
        var digits = core.onlyDigits(payload.document);
        if (digits.length === 11 && !core.isValidCPF(digits)) {
          var docErr = new Error("CPF inválido.");
          docErr.fields = { document: "CPF inválido." };
          throw docErr;
        }
      }
      if (payload.id) {
        var existing = state.customers.find(function (c) {
          return c.id === payload.id;
        });
        if (!existing) throw new Error("Cliente não encontrado.");
        var updated = Object.assign({}, existing, {
          name: name,
          phone: payload.phone !== undefined ? core.onlyDigits(payload.phone) : existing.phone,
          email: payload.email || existing.email,
          document: payload.document ? core.onlyDigits(payload.document) : existing.document,
          birthDate: payload.birthDate !== undefined ? payload.birthDate : existing.birthDate,
          address: payload.address !== undefined ? payload.address : existing.address,
          notes: payload.notes !== undefined ? payload.notes : existing.notes,
          updatedAt: now()
        });
        state.customers = state.customers.map(function (c) {
          return c.id === updated.id ? updated : c;
        });
        await persist("customers", state.customers);
        return updated;
      }
      var customer = {
        id: uid(),
        name: name,
        phone: payload.phone ? core.onlyDigits(payload.phone) : "",
        email: payload.email || "",
        document: payload.document ? core.onlyDigits(payload.document) : "",
        birthDate: payload.birthDate || "",
        address: payload.address || "",
        notes: payload.notes || "",
        createdAt: now(),
        updatedAt: now()
      };
      state.customers = state.customers.concat([customer]);
      await persist("customers", state.customers);
      return customer;
    }

    async function deleteCustomer(id) {
      await ensureLoaded();
      state.customers = state.customers.filter(function (c) {
        return c.id !== id;
      });
      await persist("customers", state.customers);
      return true;
    }

    /* --------------------------- VENDAS --------------------------- */

    async function createSale(payload) {
      await ensureLoaded();
      if (!currentUser) throw new Error("Sessão expirada.");
      var items = Array.isArray(payload.items) ? payload.items : [];
      if (!items.length) throw new Error("Adicione ao menos um produto à venda.");

      var index = {};
      state.products.forEach(function (p) {
        index[p.id] = p;
      });
      var issues = core.stockIssues(items, index);
      if (issues.length) throw new Error(issues[0].reason);

      var totals = core.computeSaleTotals({
        items: items.map(function (i) {
          return { id: i.productId, unitPrice: index[i.productId].price, quantity: i.quantity, discount: 0 };
        }),
        discount: payload.discount || 0,
        surcharge: 0,
        paidAmount: payload.paidAmount
      });

      if (payload.customerId && payload.paidAmount !== undefined && totals.balanceCents > 0 && !payload.allowDebt) {
        throw new Error("O valor pago é menor que o total. Marque a venda como fiado para registrar o saldo.");
      }

      var number = (state.sales.reduce(function (acc, s) {
        return Math.max(acc, Number(s.number) || 0);
      }, 0) || 0) + 1;

      var sale = {
        id: uid(),
        number: number,
        code: core.nextCode("V-", number - 1, 6),
        customerId: payload.customerId || null,
        items: items.map(function (i) {
          var p = index[i.productId];
          return {
            productId: p.id,
            name: p.name,
            sku: p.sku,
            quantity: Math.floor(Number(i.quantity) || 1),
            unitPrice: p.price,
            cost: p.cost
          };
        }),
        subtotal: totals.subtotal,
        discount: totals.discount,
        total: totals.total,
        paid: totals.paid,
        balance: totals.balance,
        change: totals.change,
        paymentMethod: payload.paymentMethod || "DINHEIRO",
        status: "CONCLUIDA",
        notes: payload.notes || "",
        soldBy: currentUser.id,
        soldByName: currentUser.name,
        createdAt: now()
      };

      // Baixa de estoque (só depois de validar tudo)
      var byProduct = {};
      items.forEach(function (i) {
        byProduct[i.productId] = (byProduct[i.productId] || 0) + Math.floor(Number(i.quantity) || 1);
      });
      state.products = state.products.map(function (p) {
        if (!byProduct[p.id]) return p;
        return Object.assign({}, p, { stock: p.stock - byProduct[p.id], updatedAt: now() });
      });
      state.sales = [sale].concat(state.sales);

      await db.set("products", state.products);
      await persist("sales", state.sales);
      return sale;
    }

    /** Recebe (quita) o saldo em aberto de uma venda fiado. */
    async function receiveDebt(id, amountPaid) {
      await ensureLoaded();
      var sale = state.sales.find(function (s) { return s.id === id; });
      if (!sale) throw new Error("Venda não encontrada.");
      if (sale.status !== "CONCLUIDA") throw new Error("Somente vendas concluídas podem ser quitadas.");
      var balance = Number(sale.balance);
      if (balance <= 0) throw new Error("Esta venda já está quitada.");
      var received = amountPaid === undefined || amountPaid === null ? balance : Math.min(balance, Number(amountPaid));
      if (!isFinite(received) || received <= 0) throw new Error("Informe um valor maior que zero.");
      var newBalance = Math.max(0, core.round2(balance - received));
      var updated = Object.assign({}, sale, {
        paid: core.fromCents(core.toCents(sale.paid) + core.toCents(received)),
        balance: core.fromCents(core.toCents(newBalance)),
        settledAt: newBalance === 0 ? now() : null,
        settledBy: currentUser ? currentUser.name : ""
      });
      state.sales = state.sales.map(function (s) { return s.id === updated.id ? updated : s; });
      await persist("sales", state.sales);
      return updated;
    }

    async function cancelSale(id, reason) {
      await ensureLoaded();
      var sale = state.sales.find(function (s) {
        return s.id === id;
      });
      if (!sale) throw new Error("Venda não encontrada.");
      if (sale.status === "CANCELADA") throw new Error("Esta venda já está cancelada.");
      var index = {};
      state.products.forEach(function (p) {
        index[p.id] = p;
      });
      state.products = state.products.map(function (p) {
        var item = sale.items.find(function (i) {
          return i.productId === p.id;
        });
        if (!item) return p;
        return Object.assign({}, p, { stock: p.stock + item.quantity, updatedAt: now() });
      });
      var updated = Object.assign({}, sale, {
        status: "CANCELADA",
        canceledAt: now(),
        cancelReason: reason || "",
        canceledBy: currentUser ? currentUser.name : ""
      });
      state.sales = state.sales.map(function (s) {
        return s.id === updated.id ? updated : s;
      });
      await db.set("products", state.products);
      await persist("sales", state.sales);
      return updated;
    }

    /* -------------------------- DESPESAS -------------------------- */

    async function saveExpense(payload) {
      await ensureLoaded();
      var description = String(payload.description || "").trim();
      if (description.length < 2) throw new Error("Descreva a despesa.");
      var amount = Number(payload.amount);
      if (!isFinite(amount) || amount <= 0) throw new Error("Informe um valor maior que zero.");
      var expense = {
        id: uid(),
        description: description,
        amount: core.round2(amount),
        category: payload.category || "Outros",
        dueDate: payload.dueDate || core.todayKey(),
        paid: payload.paid !== false,
        createdAt: now()
      };
      state.expenses = [expense].concat(state.expenses);
      await persist("expenses", state.expenses);
      return expense;
    }

    async function deleteExpense(id) {
      await ensureLoaded();
      state.expenses = state.expenses.filter(function (e) {
        return e.id !== id;
      });
      await persist("expenses", state.expenses);
      return true;
    }

    async function toggleExpensePaid(id) {
      await ensureLoaded();
      state.expenses = state.expenses.map(function (e) {
        return e.id === id ? Object.assign({}, e, { paid: !e.paid }) : e;
      });
      await persist("expenses", state.expenses);
      return true;
    }

    /* ------------------------ CONFIGURAÇÕES ------------------------ */

    async function saveSettings(patch) {
      await ensureLoaded();
      state.settings = Object.assign({}, state.settings, patch, { updatedAt: now() });
      await persist("settings", state.settings);
      return state.settings;
    }

    /* --------------------------- LEITURA --------------------------- */

    function listProducts() {
      return state.products.slice().sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), "pt-BR");
      });
    }
    function listCustomers() {
      return state.customers.slice().sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), "pt-BR");
      });
    }
    function listSales() {
      return state.sales.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    }
    function listExpenses() {
      return state.expenses.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    }

    function dashboard(range) {
      var from = range && range.from;
      var to = range && range.to;
      var sales = state.sales.filter(function (s) {
        return s.status === "CONCLUIDA" && core.withinPeriod(s.createdAt, from, to);
      });
      var revenue = core.sumBy(sales, function (s) {
        return s.total;
      });
      var cost = core.sumBy(sales, function (s) {
        return (s.items || []).reduce(function (acc, i) {
          return acc + Number(i.cost || 0) * Number(i.quantity || 0);
        }, 0);
      });
      var expenses = state.expenses.filter(function (e) {
        return e.paid && core.withinPeriod(e.createdAt, from, to);
      });
      var expenseTotal = core.sumBy(expenses, function (e) {
        return e.amount;
      });
      var openDebt = core.sumBy(sales, function (s) {
        return s.balance;
      });
      var topProducts = core
        .groupSum(
          sales.reduce(function (acc, s) {
            return acc.concat(s.items || []);
          }, []),
          function (i) {
            return i.name;
          },
          function (i) {
            return Number(i.quantity) * Number(i.unitPrice || 0);
          }
        )
        .sort(function (a, b) {
          return b.value - a.value;
        })
        .slice(0, 5);
      var byDay = core
        .groupSum(sales, function (s) {
          return String(s.createdAt).slice(0, 10);
        }, function (s) {
          return s.total;
        })
        .sort(function (a, b) {
          return String(a.key).localeCompare(String(b.key));
        });
      return {
        salesCount: sales.length,
        revenue: revenue,
        cost: cost,
        expenses: expenseTotal,
        profit: core.round2(revenue - cost - expenseTotal),
        ticket: sales.length ? core.round2(revenue / sales.length) : 0,
        openDebt: openDebt,
        productsCount: state.products.length,
        lowStock: state.products.filter(function (p) {
          return p.stock <= Number(state.settings.lowStockThreshold || 3);
        }),
        customersCount: state.customers.length,
        topProducts: topProducts,
        byDay: byDay,
        recentSales: sales.slice(0, 5)
      };
    }

    async function exportAll() {
      await ensureLoaded();
      return {
        app: "Passarela ERP",
        exportedAt: now(),
        version: 1,
        settings: state.settings,
        // A senha NUNCA sai no export (apenas hash não exportado)
        users: state.users.map(function (u) {
          var copy = Object.assign({}, u);
          delete copy.passwordHash;
          return copy;
        }),
        products: state.products,
        customers: state.customers,
        sales: state.sales,
        expenses: state.expenses
      };
    }

    async function wipeData() {
      await db.clearAll();
      state = {
        users: [],
        products: [],
        customers: [],
        sales: [],
        expenses: [],
        settings: defaultSettings(),
        session: null
      };
      currentUser = null;
      loaded = true;
      await db.set(KEYS.settings, state.settings);
      emit();
      return true;
    }

    return {
      load: load,
      subscribe: subscribe,
      getState: function () {
        return state;
      },
      getUser: getUser,
      isAuthenticated: function () {
        return Boolean(currentUser);
      },
      signup: signup,
      login: login,
      logout: logout,
      updateProfile: updateProfile,
      changePassword: changePassword,
      saveProduct: saveProduct,
      deleteProduct: deleteProduct,
      adjustStock: adjustStock,
      saveCustomer: saveCustomer,
      deleteCustomer: deleteCustomer,
      createSale: createSale,
      cancelSale: cancelSale,
      receiveDebt: receiveDebt,
      saveExpense: saveExpense,
      deleteExpense: deleteExpense,
      toggleExpensePaid: toggleExpensePaid,
      saveSettings: saveSettings,
      listProducts: listProducts,
      listCustomers: listCustomers,
      listSales: listSales,
      listExpenses: listExpenses,
      dashboard: dashboard,
      exportAll: exportAll,
      wipeData: wipeData,
      KEYS: KEYS
    };
  }

  return { createStore: createStore, KEYS: KEYS };
});
