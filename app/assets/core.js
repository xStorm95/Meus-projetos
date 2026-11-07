/*
 * Núcleo de validação e formatação — funções puras, sem DOM.
 * Roda no navegador e no Node (testes).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AccountCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function onlyDigits(value) {
    return String(value === null || value === undefined ? "" : value).replace(/\D/g, "");
  }

  /* ------------------------------- E-mail ------------------------------- */

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidEmail(value) {
    var email = normalizeEmail(value);
    if (email.length < 5 || email.length > 254) return false;
    if (/\s/.test(email)) return false;
    return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/.test(email);
  }

  /* -------------------------------- Nome -------------------------------- */

  function normalizeName(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function isValidName(value) {
    var name = normalizeName(value);
    return name.length >= 3 && name.length <= 80 && /[A-Za-zÀ-ÿ]/.test(name);
  }

  function initials(name) {
    var parts = normalizeName(name).split(" ").filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* -------------------------------- Senha ------------------------------- */

  var COMMON = [
    "12345678", "123456789", "1234567890", "senha123", "password", "password1",
    "admin123", "qwerty123", "passarela", "palco123", "abcd1234", "11111111"
  ];

  /** Devolve a mensagem de erro ou null se a senha for aceitável. */
  function validatePassword(password) {
    var p = String(password || "");
    if (p.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
    if (p.length > 128) return "A senha pode ter no máximo 128 caracteres.";
    if (!/[A-Za-zÀ-ÿ]/.test(p)) return "Inclua pelo menos uma letra.";
    if (!/\d/.test(p)) return "Inclua pelo menos um número.";
    if (COMMON.indexOf(p.toLowerCase()) > -1) return "Essa senha é muito comum. Escolha outra.";
    if (/^(.)\1+$/.test(p)) return "Não use o mesmo caractere repetido.";
    return null;
  }

  /** 0 a 4 — usado na barra de força. */
  function passwordScore(password) {
    var p = String(password || "");
    var score = 0;
    if (p.length >= 8) score += 1;
    if (p.length >= 12) score += 1;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score += 1;
    if (/\d/.test(p) && /[^\w\s]/.test(p)) score += 1;
    return Math.min(4, score);
  }

  function passwordLabel(score) {
    return ["Muito fraca", "Fraca", "Média", "Boa", "Forte"][Math.min(4, Math.max(0, score))];
  }

  /* ----------------------------- Documentos ----------------------------- */

  function formatCPF(value) {
    var v = onlyDigits(value).slice(0, 11);
    return v
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  function isValidCPF(value) {
    var cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
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

  function formatPhone(value) {
    var v = onlyDigits(value).slice(0, 11);
    if (v.length <= 10) return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  }

  function isValidPhone(value) {
    var digits = onlyDigits(value);
    if (!digits) return true; // opcional
    return digits.length === 10 || digits.length === 11;
  }

  /* -------------------------------- Datas ------------------------------- */

  function todayKey(date) {
    var d = date || new Date();
    return (
      d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0")
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDateBR(value) {
    if (!value) return "";
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (match) return match[3] + "/" + match[2] + "/" + match[1];
    return "";
  }

  function formatDateTimeBR(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return (
      String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear() +
      " às " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0")
    );
  }

  function relativeTime(value, nowMs) {
    var then = new Date(value).getTime();
    if (isNaN(then)) return "";
    var diff = Math.max(0, (nowMs || Date.now()) - then);
    var min = Math.floor(diff / 60000);
    if (min < 1) return "agora mesmo";
    if (min < 60) return "há " + min + " min";
    var hours = Math.floor(min / 60);
    if (hours < 24) return "há " + hours + (hours === 1 ? " hora" : " horas");
    var days = Math.floor(hours / 24);
    if (days === 1) return "ontem";
    if (days < 30) return "há " + days + " dias";
    var months = Math.floor(days / 30);
    if (months < 12) return "há " + months + (months === 1 ? " mês" : " meses");
    return "há " + Math.floor(months / 12) + " ano(s)";
  }

  function ageFromBirthDate(birthDate, now) {
    if (!birthDate) return null;
    var b = new Date(String(birthDate) + "T00:00:00");
    if (isNaN(b.getTime())) return null;
    var ref = now || new Date();
    var age = ref.getFullYear() - b.getFullYear();
    var m = ref.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age -= 1;
    return age >= 0 && age < 130 ? age : null;
  }

  /* ------------------------------- Cadastro ------------------------------ */

  /**
   * Valida o cadastro. existingEmails: array de e-mails já cadastrados.
   */
  function validateSignup(payload, existingEmails) {
    var data = payload || {};
    var errors = {};

    if (!isValidName(data.name)) errors.name = "Informe seu nome completo (mínimo 3 letras).";

    var email = normalizeEmail(data.email);
    if (!isValidEmail(email)) errors.email = "Digite um e-mail válido, como nome@email.com.";
    else if ((existingEmails || []).indexOf(email) > -1) errors.email = "Este e-mail já tem conta. Faça login.";

    var passwordError = validatePassword(data.password);
    if (passwordError) errors.password = passwordError;
    if (String(data.password || "") !== String(data.passwordConfirm || "") || !data.passwordConfirm) {
      errors.passwordConfirm = "As duas senhas precisam ser iguais.";
    }

    if (data.document && onlyDigits(data.document).length > 0) {
      if (!isValidCPF(data.document)) errors.document = "CPF inválido — confira os números.";
    }
    if (!isValidPhone(data.phone)) errors.phone = "Telefone incompleto: use DDD + número.";

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateLogin(payload) {
    var data = payload || {};
    var errors = {};
    if (!isValidEmail(data.email)) errors.email = "Digite o e-mail da sua conta.";
    if (!data.password) errors.password = "Digite sua senha.";
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  /** Feedback de "e-mail já cadastrado" enquanto digita. */
  function emailStatus(email, existingEmails) {
    var value = normalizeEmail(email);
    if (!value) return { state: "empty", message: "" };
    if (!isValidEmail(value)) return { state: "invalid", message: "E-mail incompleto." };
    if ((existingEmails || []).indexOf(value) > -1) return { state: "taken", message: "Este e-mail já tem conta." };
    return { state: "ok", message: "E-mail disponível." };
  }

  return {
    onlyDigits: onlyDigits,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    normalizeName: normalizeName,
    isValidName: isValidName,
    initials: initials,
    validatePassword: validatePassword,
    passwordScore: passwordScore,
    passwordLabel: passwordLabel,
    formatCPF: formatCPF,
    isValidCPF: isValidCPF,
    formatPhone: formatPhone,
    isValidPhone: isValidPhone,
    todayKey: todayKey,
    nowIso: nowIso,
    formatDateBR: formatDateBR,
    formatDateTimeBR: formatDateTimeBR,
    relativeTime: relativeTime,
    ageFromBirthDate: ageFromBirthDate,
    validateSignup: validateSignup,
    validateLogin: validateLogin,
    emailStatus: emailStatus
  };
});
