/*
 * Regras de negócio do app — funções puras (sem DOM, sem storage).
 * Este arquivo roda tanto no navegador quanto no Node (testes).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PassarelaCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Utilidades numéricas (dinheiro em centavos inteiros — sem erro de
   * ponto flutuante em somas de venda)
   * ------------------------------------------------------------------ */

  function toCents(value) {
    var n = Number(value);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  function fromCents(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }

  /**
   * Formata dinheiro em reais.
   * - número  → já está em REAIS (ex.: 189.9 → "R$ 189,90")
   * - texto   → aceita "189,90", "189.90" ou "1.299,90"
   */
  function brl(value) {
    var cents;
    if (typeof value === "string") {
      cents = toCents(parseMoneyInput(value));
    } else {
      cents = Math.round((Number(value) || 0) * 100);
    }
    var negative = cents < 0;
    var abs = Math.abs(cents);
    var reais = String(Math.floor(abs / 100));
    var centavos = String(abs % 100).padStart(2, "0");
    reais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (negative ? "-" : "") + "R$ " + reais + "," + centavos;
  }

  function parseMoneyInput(text) {
    if (text === null || text === undefined) return 0;
    var clean = String(text).replace(/[^\d,.-]/g, "").trim();
    if (!clean) return 0;
    if (clean.indexOf(",") > -1) clean = clean.replace(/\./g, "").replace(",", ".");
    var n = parseFloat(clean);
    if (!isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  /* ------------------------------------------------------------------ *
   * Validações (CPF/CNPJ/e-mail/telefone) — algoritmo oficial
   * ------------------------------------------------------------------ */

  function onlyDigits(text) {
    return String(text || "").replace(/\D/g, "");
  }

  function isValidCPF(input) {
    var cpf = onlyDigits(input);
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
    var d1 = (sum * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(cpf[9], 10)) return false;
    sum = 0;
    for (var j = 0; j < 10; j++) sum += parseInt(cpf[j], 10) * (11 - j);
    var d2 = (sum * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === parseInt(cpf[10], 10);
  }

  function isValidCNPJ(input) {
    var cnpj = onlyDigits(input);
    if (cnpj.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(cnpj)) return false;
    var weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    for (var i = 0; i < 12; i++) sum += parseInt(cnpj[i], 10) * weights1[i];
    var d1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (d1 !== parseInt(cnpj[12], 10)) return false;
    sum = 0;
    for (var j = 0; j < 13; j++) sum += parseInt(cnpj[j], 10) * weights2[j];
    var d2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    return d2 === parseInt(cnpj[13], 10);
  }

  function maskCPF(value) {
    var v = onlyDigits(value).slice(0, 11);
    return v
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  function maskCNPJ(value) {
    var v = onlyDigits(value).slice(0, 14);
    return v
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }

  function maskPhone(value) {
    var v = onlyDigits(value).slice(0, 11);
    if (v.length <= 10) {
      return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    }
    return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  }

  function isValidEmail(text) {
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(String(text || "").trim());
  }

  /* ------------------------------------------------------------------ *
   * Senha
   * ------------------------------------------------------------------ */

  function validatePasswordStrength(password) {
    var p = String(password || "");
    if (p.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
    if (!/[a-zA-Z]/.test(p)) return "A senha deve conter ao menos uma letra.";
    if (!/[0-9]/.test(p)) return "A senha deve conter ao menos um número.";
    if (
      ["12345678", "senha123", "password", "admin123", "passarela", "87654321", "qwerty123"].indexOf(
        p.toLowerCase()
      ) > -1
    ) {
      return "Esta senha é muito comum. Escolha outra.";
    }
    return null;
  }

  function passwordScore(password) {
    var p = String(password || "");
    var score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
    if (/\d/.test(p)) score++;
    if (/[^\w\s]/.test(p)) score++;
    return Math.min(4, score);
  }

  /* ------------------------------------------------------------------ *
   * Formatos de data
   * ------------------------------------------------------------------ */

  function todayKey(date) {
    var d = date || new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDateBR(value) {
    if (!value) return "—";
    var raw = String(value);
    var dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (dateOnly) return dateOnly[3] + "/" + dateOnly[2] + "/" + dateOnly[1];
    var d = new Date(raw);
    if (isNaN(d.getTime())) return "—";
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function formatTimeBR(value) {
    if (!value) return "--:--";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "--:--";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function formatDateTimeBR(value) {
    if (!value) return "—";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return (
      formatDateBR(todayKey(d)) +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0")
    );
  }

  /* ------------------------------------------------------------------ *
   * Vendas
   * ------------------------------------------------------------------ */

  /**
   * Calcula totais de uma venda. Todos os valores em REAIS (number),
   * aritmética em centavos para não acumular erro.
   * items: [{ unitPrice, quantity, discount }]
   */
  function computeSaleTotals(payload) {
    var data = payload || {};
    var items = Array.isArray(data.items) ? data.items : [];
    var subtotalCents = 0;
    var itemDiscountCents = 0;
    var lines = [];

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
      var unitCents = toCents(item.unitPrice);
      var lineCents = unitCents * qty;
      var discountCents = Math.min(lineCents, Math.max(0, toCents(item.discount)));
      subtotalCents += lineCents;
      itemDiscountCents += discountCents;
      lines.push({
        id: item.id,
        quantity: qty,
        unitPriceCents: unitCents,
        lineTotalCents: lineCents - discountCents,
        discountCents: discountCents
      });
    }

    var globalDiscountCents = Math.min(
      subtotalCents - itemDiscountCents,
      Math.max(0, toCents(data.discount))
    );
    var surchargeCents = Math.max(0, toCents(data.surcharge));
    var totalCents = subtotalCents - itemDiscountCents - globalDiscountCents + surchargeCents;

    var paidCents = Math.max(0, toCents(data.paidAmount));
    var changeCents = Math.max(0, paidCents - totalCents);
    var balanceCents = Math.max(0, totalCents - paidCents);

    return {
      lines: lines,
      subtotal: fromCents(subtotalCents),
      discount: fromCents(itemDiscountCents + globalDiscountCents),
      surcharge: fromCents(surchargeCents),
      total: fromCents(totalCents),
      totalCents: totalCents,
      paid: fromCents(paidCents),
      change: fromCents(changeCents),
      balance: fromCents(balanceCents),
      itemCount: lines.reduce(function (acc, l) {
        return acc + l.quantity;
      }, 0)
    };
  }

  /** Estoque suficiente? Devolve lista de itens com problema. */
  function stockIssues(items, productIndex) {
    var problems = [];
    for (var i = 0; i < (items || []).length; i++) {
      var item = items[i];
      var available = productIndex && productIndex[item.productId] ? Number(productIndex[item.productId].stock) : 0;
      if (!productIndex[item.productId]) {
        problems.push({ productId: item.productId, reason: "Produto não encontrado" });
      } else if (Number(item.quantity) > available) {
        problems.push({
          productId: item.productId,
          reason: "Estoque insuficiente (disponível: " + available + ")"
        });
      }
    }
    return problems;
  }

  /** Próximo número sequencial formatado (ex.: V-000123). */
  function nextCode(prefix, lastNumber, padding) {
    var n = (Number(lastNumber) || 0) + 1;
    return prefix + String(n).padStart(padding || 6, "0");
  }

  /* ------------------------------------------------------------------ *
   * DRE / resumo financeiro
   * ------------------------------------------------------------------ */

  /**
   * payments: [{ method, amount }], despesas: [{ amount, category }]
   */
  function financialSummary(payload) {
    var data = payload || {};
    var payments = Array.isArray(data.payments) ? data.payments : [];
    var expenses = Array.isArray(data.expenses) ? data.expenses : [];
    var byMethod = {};
    var grossCents = 0;
    for (var i = 0; i < payments.length; i++) {
      var cents = toCents(payments[i].amount);
      grossCents += cents;
      var method = payments[i].method || "OUTRO";
      byMethod[method] = (byMethod[method] || 0) + cents;
    }
    var expenseCents = 0;
    var expenseByCategory = {};
    for (var j = 0; j < expenses.length; j++) {
      var e = toCents(expenses[j].amount);
      expenseCents += e;
      var cat = expenses[j].category || "Outros";
      expenseByCategory[cat] = (expenseByCategory[cat] || 0) + e;
    }
    var cogsCents = toCents(data.costOfGoods);
    var resultCents = grossCents - cogsCents - expenseCents;

    var methods = Object.keys(byMethod).map(function (key) {
      return { method: key, amount: fromCents(byMethod[key]) };
    });
    var categories = Object.keys(expenseByCategory).map(function (key) {
      return { category: key, amount: fromCents(expenseByCategory[key]) };
    });

    return {
      gross: fromCents(grossCents),
      costOfGoods: fromCents(cogsCents),
      expenses: fromCents(expenseCents),
      result: fromCents(resultCents),
      marginPercent: grossCents ? round2((resultCents / grossCents) * 100) : 0,
      byMethod: methods,
      expenseByCategory: categories
    };
  }

  /* ------------------------------------------------------------------ *
   * Agregações para dashboard
   * ------------------------------------------------------------------ */

  function sumBy(list, picker) {
    return (list || []).reduce(function (acc, item) {
      return acc + (Number(picker(item)) || 0);
    }, 0);
  }

  function groupSum(list, keyFn, valueFn) {
    var map = {};
    (list || []).forEach(function (item) {
      var key = keyFn(item);
      map[key] = (map[key] || 0) + (Number(valueFn(item)) || 0);
    });
    return Object.keys(map).map(function (key) {
      return { key: key, value: map[key] };
    });
  }

  function withinPeriod(dateIso, fromKey, toKey) {
    var day = String(dateIso || "").slice(0, 10);
    if (fromKey && day < fromKey) return false;
    if (toKey && day > toKey) return false;
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Sessão / bloqueio de tentativas
   * ------------------------------------------------------------------ */

  function isLocked(user, nowMs) {
    if (!user || !user.lockedUntil) return false;
    return new Date(user.lockedUntil).getTime() > (nowMs || Date.now());
  }

  function registerFailedAttempt(user, nowMs) {
    var current = Number(user.failedAttempts || 0) + 1;
    var now = nowMs || Date.now();
    return {
      failedAttempts: current,
      lockedUntil: current >= 5 ? new Date(now + 15 * 60 * 1000).toISOString() : null
    };
  }

  function resetAttempts() {
    return { failedAttempts: 0, lockedUntil: null };
  }

  /* ------------------------------------------------------------------ *
   * Validação de cadastro
   * ------------------------------------------------------------------ */

  function validateSignup(payload, existingUsers) {
    var data = payload || {};
    var errors = {};
    var name = String(data.name || "").trim();
    var email = String(data.email || "").trim().toLowerCase();

    if (name.length < 3) errors.name = "Informe seu nome completo (mínimo 3 letras).";
    if (!isValidEmail(email)) errors.email = "Informe um e-mail válido.";
    var taken = (existingUsers || []).some(function (u) {
      return String(u.email || "").toLowerCase() === email;
    });
    if (taken) errors.email = "Este e-mail já está cadastrado. Faça login.";

    var strength = validatePasswordStrength(data.password);
    if (strength) errors.password = strength;
    if (data.password !== data.passwordConfirm) errors.passwordConfirm = "As senhas não conferem.";

    if (data.document) {
      var digits = onlyDigits(data.document);
      if (digits.length === 11 && !isValidCPF(digits)) errors.document = "CPF inválido.";
      else if (digits.length === 14 && !isValidCNPJ(digits)) errors.document = "CNPJ inválido.";
      else if (digits.length !== 11 && digits.length !== 14) errors.document = "Informe CPF (11) ou CNPJ (14 dígitos).";
    }

    if (data.phone && onlyDigits(data.phone).length < 10) errors.phone = "Telefone incompleto (DDD + número).";

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  /** Texto de boas-vindas conforme a hora do dia. */
  function greeting(now) {
    var hour = (now || new Date()).getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }

  function relativeTime(iso, nowMs) {
    var then = new Date(iso).getTime();
    if (isNaN(then)) return "—";
    var diff = Math.max(0, (nowMs || Date.now()) - then);
    var min = Math.floor(diff / 60000);
    if (min < 1) return "agora mesmo";
    if (min < 60) return "há " + min + " min";
    var hours = Math.floor(min / 60);
    if (hours < 24) return "há " + hours + " h";
    var days = Math.floor(hours / 24);
    if (days === 1) return "ontem";
    if (days < 30) return "há " + days + " dias";
    var months = Math.floor(days / 30);
    return "há " + months + (months === 1 ? " mês" : " meses");
  }

  /** CSV com BOM e separador ";" (abre no Excel em português). */
  function toCsv(headers, rows) {
    function cell(value) {
      var text = value === null || value === undefined ? "" : String(value);
      if (/[";\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
      return text;
    }
    var lines = [headers.map(cell).join(";")];
    (rows || []).forEach(function (row) {
      lines.push(row.map(cell).join(";"));
    });
    return lines.join("\r\n");
  }

  function slug(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  return {
    toCents: toCents,
    fromCents: fromCents,
    brl: brl,
    parseMoneyInput: parseMoneyInput,
    round2: round2,
    onlyDigits: onlyDigits,
    isValidCPF: isValidCPF,
    isValidCNPJ: isValidCNPJ,
    maskCPF: maskCPF,
    maskCNPJ: maskCNPJ,
    maskPhone: maskPhone,
    isValidEmail: isValidEmail,
    validatePasswordStrength: validatePasswordStrength,
    passwordScore: passwordScore,
    todayKey: todayKey,
    nowIso: nowIso,
    formatDateBR: formatDateBR,
    formatDateTimeBR: formatDateTimeBR,
    formatTimeBR: formatTimeBR,
    computeSaleTotals: computeSaleTotals,
    stockIssues: stockIssues,
    nextCode: nextCode,
    financialSummary: financialSummary,
    sumBy: sumBy,
    groupSum: groupSum,
    withinPeriod: withinPeriod,
    isLocked: isLocked,
    registerFailedAttempt: registerFailedAttempt,
    resetAttempts: resetAttempts,
    validateSignup: validateSignup,
    greeting: greeting,
    relativeTime: relativeTime,
    toCsv: toCsv,
    slug: slug
  };
});
