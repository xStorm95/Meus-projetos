/*
 * Interface de conta: Login, Criar conta e Meu perfil.
 * Sem framework. Todo o estado vive no AccountStore (IndexedDB + localStorage).
 */
(function () {
  "use strict";

  var core = window.AccountCore;
  var hash = window.AccountHash;
  var lib = window.AccountStore;
  var Icons = window.AppIcons;

  var db = null;
  var store = null;
  var route = "login";
  var pendingPhoto = null;
  var photoState = { saved: false, at: null };
  var MAX_PHOTO_SIDE = 512;

  /* ============================== HELPERS DOM ============================== */

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }
  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }
  function esc(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function val(scope, name) {
    var node = scope ? scope.querySelector('[name="' + name + '"]') : null;
    return node ? node.value : "";
  }
  /** scrollIntoView seguro (ambientes sem a API, ex.: testes). */
  function reveal(node) {
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /* ================================ TOASTS ================================ */

  var TOAST_ICONS = {
    success: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>'
  };

  function toast(message, type, title) {
    var holder = $("#toasts");
    if (!holder) return;
    var kind = type || "success";
    var node = document.createElement("div");
    node.className = "toast toast-" + kind;
    node.innerHTML =
      '<span class="toast-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (TOAST_ICONS[kind] || TOAST_ICONS.info) + "</svg></span>" +
      '<div class="toast-content"><strong>' + esc(title || (kind === "error" ? "Não foi possível" : "Tudo certo")) + "</strong>" +
      "<span>" + esc(message) + "</span></div>";
    holder.appendChild(node);
    setTimeout(function () {
      node.classList.add("out");
      setTimeout(function () { node.remove(); }, 260);
    }, kind === "error" ? 5200 : 3200);
  }

  /* ============================== VALIDAÇÃO UI ============================== */

  function setError(form, name, message) {
    var slot = form.querySelector('[data-error="' + name + '"]');
    var input = form.querySelector('[name="' + name + '"]');
    if (slot) {
      slot.textContent = message || "";
      slot.classList.toggle("show", Boolean(message));
    }
    if (input) {
      input.classList.toggle("invalid", Boolean(message));
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }
  }

  function clearErrors(form) {
    $$("[data-error]", form).forEach(function (slot) {
      slot.textContent = "";
      slot.classList.remove("show");
    });
    $$(".invalid", form).forEach(function (input) {
      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    });
  }

  function showErrors(form, errors) {
    clearErrors(form);
    var names = Object.keys(errors || {});
    names.forEach(function (name) { setError(form, name, errors[name]); });
    if (names.length) {
      var first = form.querySelector('[name="' + names[0] + '"]');
      if (first) first.focus();
    }
    return names.length;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> ' + esc(label || "Aguarde...");
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  /* ============================== MÁSCARAS ============================== */

  function maskInput(input, formatter) {
    if (!input) return;
    input.addEventListener("input", function () {
      var before = input.value.length;
      var pos = input.selectionStart;
      input.value = formatter(input.value);
      var after = input.value.length;
      if (pos !== null) input.setSelectionRange(pos + (after - before), pos + (after - before));
    });
  }

  /* ============================== TEMA / CONTRASTE ============================== */

  function bootChrome() {
    var saved = null;
    try { saved = localStorage.getItem("conta:theme"); } catch (err) { saved = null; }
    var theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(theme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("conta:theme", theme); } catch (err) { /* ignora */ }
    $$("[data-theme-toggle]").forEach(function (btn) {
      btn.innerHTML = Icons.icon(theme === "dark" ? "sun" : "moon", 18);
      btn.setAttribute("aria-label", theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro");
    });
  }

  function toggleTheme() {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  /* ================================ AVATAR ================================ */

  function avatarMarkup(account, size) {
    var cls = "avatar avatar-" + (size || "md");
    if (account && account.avatar) {
      return '<span class="' + cls + '"><img src="' + account.avatar + '" alt="Foto de ' + esc(account.name) + '"></span>';
    }
    return '<span class="' + cls + '">' + esc(core.initials(account && account.name)) + "</span>";
  }

  /* ================================ FOTO ================================ */

  function readPhoto(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("Nenhum arquivo selecionado."));
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) {
        return reject(new Error("Escolha uma imagem JPG, PNG ou WEBP."));
      }
      if (file.size > 15 * 1024 * 1024) return reject(new Error("A imagem precisa ter menos de 15 MB."));

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Não conseguimos ler o arquivo.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("O arquivo parece não ser uma imagem válida.")); };
        img.onload = function () {
          var scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.width, img.height));
          var w = Math.max(1, Math.round(img.width * scale));
          var h = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoFile(file) {
    var zone = $("#photo-drop");
    try {
      if (zone) zone.classList.add("busy");
      var dataUrl = await readPhoto(file);
      pendingPhoto = dataUrl;
      $("#photo-preview").innerHTML = '<span class="avatar avatar-xl"><img src="' + dataUrl + '" alt="Prévia da foto"></span>';
      $("#photo-actions").classList.remove("hidden");
      $("#photo-hint").textContent = "Prévia carregada — clique em “Salvar foto” para gravar no seu perfil.";
      $("#photo-save").focus();
    } catch (err) {
      toast(err.message, "error", "Foto não aceita");
    } finally {
      if (zone) zone.classList.remove("busy");
    }
  }

  /* ================================ ROTAS ================================ */

  function routeFromHash() {
    var h = (window.location.hash || "").replace("#", "");
    if (store.isAuthenticated()) {
      if (h === "cadastro" || h === "login") return "perfil";
      return "perfil";
    }
    return h === "cadastro" ? "cadastro" : "login";
  }

  function go(next) {
    window.location.hash = next;
  }

  function render() {
    route = routeFromHash();
    var root = $("#app");
    if (store.isAuthenticated()) {
      root.innerHTML = profileView(store.currentAccount());
      bindProfile();
    } else {
      root.innerHTML = route === "cadastro" ? signupView() : loginView();
      route === "cadastro" ? bindSignup() : bindLogin();
    }
  }

  function brandPanel() {
    return (
      '<aside class="brand">' +
        '<div class="brand-top">' +
          '<div class="brand-logo"><span class="brand-mark">P</span><span>Palco</span></div>' +
          '<button class="icon-btn brand-theme" data-theme-toggle type="button"></button>' +
        "</div>" +
        '<div class="brand-center">' +
          '<h1>Sua conta,<br><em>no seu tempo.</em></h1>' +
          '<p>Cadastro rápido, login seguro e sua foto guardada. Volte quando quiser — a sessão continua salva neste dispositivo.</p>' +
          '<ul class="brand-list">' +
            "<li>" + Icons.icon("shield", 18) + "<span><strong>Senha protegida</strong> com PBKDF2-SHA256, 210 mil iterações</span></li>" +
            "<li>" + Icons.icon("camera", 18) + "<span><strong>Foto de perfil</strong> redimensionada e salva</span></li>" +
            "<li>" + Icons.icon("database", 18) + "<span><strong>Dados no aparelho</strong> — nada sai para servidores</span></li>" +
          "</ul>" +
        "</div>" +
        '<div class="brand-foot">Ao criar a conta, seus dados ficam salvos apenas neste navegador.</div>' +
      "</aside>"
    );
  }

  /* ================================ LOGIN ================================ */

  function loginView() {
    return (
      '<div class="shell">' + brandPanel() +
        '<main class="panel">' +
          '<div class="card">' +
            '<div class="card-head">' +
              "<h2>Entrar na sua conta</h2>" +
              "<p>Informe o e-mail e a senha que você cadastrou.</p>" +
            "</div>" +
            '<form class="form" id="form-login" novalidate autocomplete="on">' +
              '<div class="field">' +
                '<label for="login-email">E-mail</label>' +
                '<div class="control">' + Icons.icon("mail", 17) +
                  '<input id="login-email" name="email" type="email" autocomplete="username" placeholder="voce@email.com" required>' +
                "</div>" +
                '<span class="error-slot" data-error="email"></span>' +
              "</div>" +
              '<div class="field">' +
                '<label for="login-password">Senha</label>' +
                '<div class="control">' + Icons.icon("lock", 17) +
                  '<input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Sua senha" required>' +
                  '<button class="reveal" type="button" data-reveal="login-password" aria-label="Mostrar senha">' + Icons.icon("eye", 17) + "</button>" +
                "</div>" +
                '<span class="error-slot" data-error="password"></span>' +
              "</div>" +
              '<button class="btn btn-primary btn-block" type="submit" id="login-submit">Entrar</button>' +
            "</form>" +
            '<div class="card-foot">Ainda não tem conta? <a href="#cadastro">Criar conta grátis</a></div>' +
            (store.accountCount() === 0
              ? '<div class="notice">' + Icons.icon("info", 17) + "<span>Nenhuma conta neste navegador ainda. <a href=\"#cadastro\">Crie a primeira</a> — leva 30 segundos.</span></div>"
              : "") +
          "</div>" +
        "</main>" +
      "</div>"
    );
  }

  function bindLogin() {
    var form = $("#form-login");
    if (!form) return;
    var reveal = $("[data-reveal]", form);
    if (reveal) reveal.addEventListener("click", function () {
      var input = $("#login-password");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      reveal.innerHTML = Icons.icon(show ? "eyeOff" : "eye", 17);
      reveal.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearErrors(form);
      var payload = { email: val(form, "email"), password: val(form, "password") };
      var check = core.validateLogin(payload);
      if (!check.valid) return showErrors(form, check.errors);

      var button = $("#login-submit");
      setBusy(button, true, "Entrando...");
      try {
        var account = await store.login(payload.email, payload.password);
        toast("Que bom te ver, " + account.name.split(" ")[0] + "!", "success", "Login realizado");
        go("perfil");
        render();
        setTimeout(function () { window.scrollTo({ top: 0, behavior: "smooth" }); }, 60);
      } catch (err) {
        showErrors(form, err.fields || {});
        if (!err.fields) toast(err.message, "error");
      } finally {
        setBusy(button, false);
      }
    });
  }

  /* ================================ CADASTRO ================================ */

  function signupView() {
    return (
      '<div class="shell">' + brandPanel() +
        '<main class="panel">' +
          '<div class="card">' +
            '<div class="card-head">' +
              "<h2>Criar sua conta</h2>" +
              "<p>Leva menos de um minuto. A foto você adiciona depois, no perfil.</p>" +
            "</div>" +
            '<form class="form" id="form-signup" novalidate autocomplete="on">' +
              '<div class="field">' +
                '<label for="su-name">Nome completo</label>' +
                '<div class="control">' + Icons.icon("user", 17) +
                  '<input id="su-name" name="name" autocomplete="name" placeholder="Ana Beatriz Lopes" required>' +
                "</div>" +
                '<span class="error-slot" data-error="name"></span>' +
              "</div>" +
              '<div class="field">' +
                '<label for="su-email">E-mail</label>' +
                '<div class="control">' + Icons.icon("mail", 17) +
                  '<input id="su-email" name="email" type="email" autocomplete="email" placeholder="voce@email.com" required>' +
                  '<span class="field-check" data-email-check></span>' +
                "</div>" +
                '<span class="error-slot" data-error="email"></span>' +
              "</div>" +
              '<div class="grid-2">' +
                '<div class="field">' +
                  '<label for="su-phone">Telefone <span class="opt">(opcional)</span></label>' +
                  '<div class="control">' + Icons.icon("phone", 17) +
                    '<input id="su-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="(31) 99999-8888">' +
                  "</div>" +
                  '<span class="error-slot" data-error="phone"></span>' +
                "</div>" +
                '<div class="field">' +
                  '<label for="su-document">CPF <span class="opt">(opcional)</span></label>' +
                  '<div class="control">' + Icons.icon("id", 17) +
                    '<input id="su-document" name="document" inputmode="numeric" placeholder="000.000.000-00">' +
                  "</div>" +
                  '<span class="error-slot" data-error="document"></span>' +
                "</div>" +
              "</div>" +
              '<div class="field">' +
                '<label for="su-password">Senha</label>' +
                '<div class="control">' + Icons.icon("lock", 17) +
                  '<input id="su-password" name="password" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres com número" required>' +
                  '<button class="reveal" type="button" data-reveal="su-password" aria-label="Mostrar senha">' + Icons.icon("eye", 17) + "</button>" +
                "</div>" +
                '<div class="strength" data-strength><span></span><span></span><span></span><span></span></div>' +
                '<span class="strength-label" data-strength-label></span>' +
                '<span class="error-slot" data-error="password"></span>' +
              "</div>" +
              '<div class="field">' +
                '<label for="su-password-confirm">Confirmar senha</label>' +
                '<div class="control">' + Icons.icon("lock", 17) +
                  '<input id="su-password-confirm" name="passwordConfirm" type="password" autocomplete="new-password" placeholder="Repita a senha" required>' +
                  '<span class="field-check" data-match-check></span>' +
                "</div>" +
                '<span class="error-slot" data-error="passwordConfirm"></span>' +
              "</div>" +
              '<button class="btn btn-primary btn-block" type="submit" id="signup-submit">Criar conta</button>' +
            "</form>" +
            '<div class="card-foot">Já tem conta? <a href="#login">Entrar</a></div>' +
          "</div>" +
        "</main>" +
      "</div>"
    );
  }

  function bindSignup() {
    var form = $("#form-signup");
    if (!form) return;

    maskInput($("#su-phone"), core.formatPhone);
    maskInput($("#su-document"), core.formatCPF);

    $$("[data-reveal]", form).forEach(function (button) {
      button.addEventListener("click", function () {
        var input = $("#" + button.dataset.reveal);
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        button.innerHTML = Icons.icon(show ? "eyeOff" : "eye", 17);
      });
    });

    var email = $("#su-email");
    email.addEventListener("input", function () {
      var status = core.emailStatus(email.value, store.listEmails());
      var slot = $("[data-email-check]");
      slot.className = "field-check " + (status.state === "ok" ? "ok" : status.state === "taken" ? "bad" : "");
      slot.innerHTML = status.state === "ok" ? Icons.icon("check", 15) : status.state === "taken" ? Icons.icon("xCircle", 15) : "";
      setError(form, "email", status.state === "taken" ? status.message : "");
    });

    var password = $("#su-password");
    password.addEventListener("input", function () {
      var score = core.passwordScore(password.value);
      var bar = $("[data-strength]");
      bar.dataset.score = String(score);
      $("[data-strength-label]").textContent = password.value ? core.passwordLabel(score) : "";
      if (val(form, "passwordConfirm")) checkMatch();
    });

    function checkMatch() {
      var slot = $("[data-match-check]");
      var same = val(form, "passwordConfirm") && val(form, "password") === val(form, "passwordConfirm");
      slot.className = "field-check " + (same ? "ok" : "");
      slot.innerHTML = same ? Icons.icon("check", 15) : "";
      if (same) setError(form, "passwordConfirm", "");
    }
    $("#su-password-confirm").addEventListener("input", checkMatch);

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearErrors(form);
      var payload = {
        name: val(form, "name"),
        email: val(form, "email"),
        phone: val(form, "phone"),
        document: val(form, "document"),
        password: val(form, "password"),
        passwordConfirm: val(form, "passwordConfirm")
      };
      var check = core.validateSignup(payload, store.listEmails());
      if (!check.valid) return showErrors(form, check.errors);

      var button = $("#signup-submit");
      setBusy(button, true, "Criando sua conta...");
      try {
        var account = await store.signup(payload);
        toast("Conta criada com sucesso. Bem-vinda, " + account.name.split(" ")[0] + "!", "success");
        go("perfil");
        render();
      } catch (err) {
        showErrors(form, err.fields || {});
        if (!err.fields) toast(err.message, "error");
      } finally {
        setBusy(button, false);
      }
    });
  }

  /* ================================ PERFIL ================================ */

  function profileView(account) {
    var age = core.ageFromBirthDate(account.birthDate);
    var memberSince = core.formatDateBR(account.createdAt);
    var lastLogin = account.lastLoginAt ? core.relativeTime(account.lastLoginAt) : "agora";
    var driverLabel = store.driver() === "indexeddb" ? "IndexedDB" : store.driver() === "localstorage" ? "Armazenamento local" : "Memória (temporário)";

    return (
      '<div class="app">' +
        '<header class="topbar">' +
          '<div class="topbar-brand"><span class="brand-mark sm">P</span><span>Palco</span></div>' +
          '<div class="topbar-right">' +
            '<span class="save-chip" id="save-chip">' + Icons.icon("check", 14) + "<span>Tudo salvo</span></span>" +
            '<button class="icon-btn" data-theme-toggle type="button"></button>' +
            '<div class="account-chip">' + avatarMarkup(account, "sm") +
              '<div class="account-chip-text"><strong>' + esc(account.name.split(" ")[0]) + "</strong><span>" + esc(account.email) + "</span></div>" +
            "</div>" +
            '<button class="btn btn-ghost btn-sm" id="logout-btn" type="button">' + Icons.icon("logout", 16) + "<span>Sair</span></button>" +
          "</div>" +
        "</header>" +

        '<main class="view">' +
          '<section class="hero">' +
            '<div class="hero-left">' +
              '<div class="photo-block">' +
                '<div id="photo-preview">' + avatarMarkup(account, "xl") + "</div>" +
                '<button class="photo-badge" id="photo-pick" type="button" title="Trocar foto">' + Icons.icon("camera", 16) + "</button>" +
                '<input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp" hidden>' +
              "</div>" +
              "<div class=\"hero-info\">" +
                "<h1>" + esc(account.name) + "</h1>" +
                '<p class="hero-email">' + esc(account.email) + "</p>" +
                '<div class="chips">' +
                  '<span class="chip">' + Icons.icon("calendar", 13) + " Conta criada em " + esc(memberSince) + "</span>" +
                  (age !== null ? '<span class="chip">' + Icons.icon("user", 13) + " " + age + " anos</span>" : "") +
                  (account.city ? '<span class="chip">' + Icons.icon("pin", 13) + " " + esc(account.city) + "</span>" : "") +
                "</div>" +
              "</div>" +
            "</div>" +
            '<div class="hero-actions">' +
              '<button class="btn btn-primary" id="photo-pick-2" type="button">' + Icons.icon("camera", 16) + " Trocar foto</button>" +
              '<button class="btn btn-outline" id="photo-remove" type="button"' + (account.avatar ? "" : " disabled") + ">Remover</button>" +
            "</div>" +
          "</section>" +

          '<div class="layout">' +
            '<section class="col-main">' +
              /* ----- foto ----- */
              '<article class="card">' +
                '<div class="card-title">' + Icons.icon("camera", 17) + "<h2>Foto do perfil</h2>" +
                  (account.photoUpdatedAt ? '<span class="badge-soft">atualizada ' + esc(core.relativeTime(account.photoUpdatedAt)) + "</span>" : "") +
                "</div>" +
                '<div class="card-body">' +
                  '<div class="dropzone" id="photo-drop" tabindex="0" role="button" aria-label="Enviar foto">' +
                    Icons.icon("upload", 22) +
                    "<strong>Arraste uma foto ou clique para escolher</strong>" +
                    '<span>JPG, PNG ou WEBP · até 15 MB · ajustamos para 512 px automaticamente</span>' +
                    '<span class="photo-hint" id="photo-hint">Sua foto fica salva neste disposivo e aparece ao entrar.</span>' +
                  "</div>" +
                  '<div class="photo-actions hidden" id="photo-actions">' +
                    '<button class="btn btn-primary" id="photo-save" type="button">' + Icons.icon("check", 16) + " Salvar foto</button>" +
                    '<button class="btn btn-ghost" id="photo-cancel" type="button">Cancelar</button>' +
                  "</div>" +
                "</div>" +
              "</article>" +

              /* ----- dados ----- */
              '<article class="card">' +
                '<div class="card-title">' + Icons.icon("user", 17) + "<h2>Seus dados</h2></div>" +
                '<div class="card-body">' +
                  '<form class="form" id="form-profile" novalidate>' +
                    '<div class="grid-2">' +
                      field("Nome completo", "name", account.name, "text", "user") +
                      field("E-mail", "email", account.email, "email", "mail") +
                    "</div>" +
                    '<div class="grid-2">' +
                      field("Telefone", "phone", account.phone ? core.formatPhone(account.phone) : "", "tel", "phone") +
                      field("CPF", "document", account.document ? core.formatCPF(account.document) : "", "text", "id") +
                    "</div>" +
                    '<div class="grid-2">' +
                      field("Data de nascimento", "birthDate", account.birthDate || "", "date", "calendar") +
                      field("Cidade", "city", account.city || "", "text", "pin") +
                    "</div>" +
                    '<div class="field">' +
                      '<label for="pf-bio">Sobre você <span class="opt">(opcional)</span></label>' +
                      '<textarea id="pf-bio" name="bio" maxlength="300" placeholder="Uma frase sobre você...">' + esc(account.bio || "") + "</textarea>" +
                      '<span class="counter" data-bio-counter>' + (account.bio || "").length + "/300</span>" +
                    "</div>" +
                    '<div class="form-actions">' +
                      '<button class="btn btn-primary" type="submit" id="profile-submit">Salvar alterações</button>' +
                      '<button class="btn btn-ghost" type="reset" id="profile-reset">Desfazer</button>' +
                    "</div>" +
                  "</form>" +
                "</div>" +
              "</article>" +
            "</section>" +

            '<aside class="col-side">' +
              /* ----- sessão ----- */
              '<article class="card">' +
                '<div class="card-title">' + Icons.icon("shield", 17) + "<h2>Sessão e segurança</h2></div>" +
                '<div class="card-body stack">' +
                  '<div class="kv"><span>Último acesso</span><strong>' + esc(lastLogin) + "</strong></div>" +
                  '<div class="kv"><span>Sessão válida por</span><strong>24 horas</strong></div>' +
                  '<div class="kv"><span>Onde os dados ficam</span><strong>' + esc(driverLabel) + "</strong></div>" +
                  '<div class="kv"><span>Espaço usado</span><strong>' + esc(store.storageEstimate()) + "</strong></div>" +
                  '<button class="btn btn-outline btn-block" id="open-password" type="button">' + Icons.icon("lock", 16) + " Alterar senha</button>" +
                  '<button class="btn btn-ghost btn-block" id="logout-btn-2" type="button">' + Icons.icon("logout", 16) + " Sair da conta</button>" +
                "</div>" +
              "</article>" +

              /* ----- senha ----- */
              '<article class="card hidden" id="password-card">' +
                '<div class="card-title">' + Icons.icon("lock", 17) + "<h2>Alterar senha</h2></div>" +
                '<div class="card-body">' +
                  '<form class="form" id="form-password" novalidate>' +
                    field("Senha atual", "currentPassword", "", "password", "lock") +
                    '<div class="field">' +
                      '<label for="np">Nova senha</label>' +
                      '<div class="control">' + Icons.icon("lock", 17) +
                        '<input id="np" name="newPassword" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres com número">' +
                      "</div>" +
                      '<div class="strength" data-strength><span></span><span></span><span></span><span></span></div>' +
                      '<span class="error-slot" data-error="newPassword"></span>' +
                    "</div>" +
                    field("Confirmar nova senha", "confirmPassword", "", "password", "lock") +
                    '<div class="form-actions">' +
                      '<button class="btn btn-primary" type="submit">Salvar nova senha</button>' +
                      '<button class="btn btn-ghost" type="button" id="close-password">Cancelar</button>' +
                    "</div>" +
                  "</form>" +
                "</div>" +
              "</article>" +

              /* ----- conta ----- */
              '<article class="card">' +
                '<div class="card-title">' + Icons.icon("info", 17) + "<h2>Sobre sua conta</h2></div>" +
                '<div class="card-body stack">' +
                  '<div class="kv"><span>Contas neste navegador</span><strong>' + store.accountCount() + "</strong></div>" +
                  '<div class="kv"><span>Criptografia</span><strong>' + (store.hasSupport() ? "Web Crypto" : "Compatível") + "</strong></div>" +
                  '<p class="tiny muted">Seus dados não saem deste aparelho. Limpar os dados do navegador apaga a conta.</p>' +
                  '<button class="btn btn-danger-ghost btn-block" id="delete-account" type="button">' + Icons.icon("trash", 15) + " Excluir minha conta</button>" +
                "</div>" +
              "</article>" +
            "</aside>" +
          "</div>" +
        "</main>" +
      "</div>"
    );
  }

  function field(label, name, value, type, icon) {
    return (
      '<div class="field">' +
        '<label for="pf-' + name + '">' + esc(label) + "</label>" +
        '<div class="control">' + Icons.icon(icon || "user", 17) +
          '<input id="pf-' + name + '" name="' + name + '" type="' + (type || "text") + '" value="' + esc(value || "") + '">' +
        "</div>" +
        '<span class="error-slot" data-error="' + name + '"></span>' +
      "</div>"
    );
  }

  function bindProfile() {
    var account = store.currentAccount();
    var form = $("#form-profile");
    var drop = $("#photo-drop");
    var fileInput = $("#photo-file");

    function openPicker() { fileInput.click(); }
    $("#photo-pick").addEventListener("click", openPicker);
    $("#photo-pick-2").addEventListener("click", openPicker);
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handlePhotoFile(fileInput.files[0]);
      fileInput.value = "";
    });

    drop.addEventListener("click", openPicker);
    drop.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPicker(); }
    });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove("drag"); });
    });
    drop.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handlePhotoFile(file);
    });

    $("#photo-save").addEventListener("click", async function () {
      if (!pendingPhoto) return;
      var button = $("#photo-save");
      setBusy(button, true, "Salvando...");
      try {
        var result = await store.savePhoto(pendingPhoto);
        if (!result.saved) throw new Error("Não conseguimos confirmar a gravação. Tente novamente.");
        pendingPhoto = null;
        toast("Sua foto foi salva e vai aparecer quando você voltar.", "success", "Foto atualizada");
        render();
      } catch (err) {
        toast(err.message, "error", "Erro ao salvar a foto");
        setBusy(button, false);
      }
    });

    $("#photo-cancel").addEventListener("click", function () {
      pendingPhoto = null;
      $("#photo-preview").innerHTML = avatarMarkup(store.currentAccount(), "xl");
      $("#photo-actions").classList.add("hidden");
      $("#photo-hint").textContent = "Sua foto fica salva neste disposivo e aparece ao entrar.";
    });

    $("#photo-remove").addEventListener("click", async function () {
      if (!store.currentAccount().avatar) return;
      await store.clearPhoto();
      toast("Foto removida.", "success");
      render();
    });

    // Máscaras e contador
    maskInput($("#pf-phone"), core.formatPhone);
    maskInput($("#pf-document"), core.formatCPF);
    var bio = $("#pf-bio");
    bio.addEventListener("input", function () {
      var counter = $("[data-bio-counter]");
      if (counter) counter.textContent = bio.value.length + "/300";
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      clearErrors(form);
      var button = $("#profile-submit");
      setBusy(button, true, "Salvando...");
      try {
        await store.updateProfile({
          name: val(form, "name"),
          email: val(form, "email"),
          phone: val(form, "phone"),
          document: val(form, "document"),
          birthDate: val(form, "birthDate"),
          city: val(form, "city"),
          bio: val(form, "bio")
        });
        flashSaved();
        toast("Dados atualizados.", "success");
        render();
      } catch (err) {
        showErrors(form, err.fields || {});
        if (!err.fields) toast(err.message, "error");
      } finally {
        setBusy(button, false);
      }
    });

    $("#profile-reset").addEventListener("click", function () {
      setTimeout(function () { render(); }, 10);
    });

    // Senha
    var passwordCard = $("#password-card");
    $("#open-password").addEventListener("click", function () {
      passwordCard.classList.remove("hidden");
      reveal(passwordCard);
      $("#form-password [name='currentPassword']").focus();
    });
    $("#close-password").addEventListener("click", function () { passwordCard.classList.add("hidden"); });

    var newPassword = $("#np");
    newPassword.addEventListener("input", function () {
      var bar = passwordCard.querySelector("[data-strength]");
      bar.dataset.score = String(core.passwordScore(newPassword.value));
    });

    $("#form-password").addEventListener("submit", async function (event) {
      event.preventDefault();
      var pwdForm = event.target;
      clearErrors(pwdForm);
      try {
        await store.changePassword(
          val(pwdForm, "currentPassword"),
          val(pwdForm, "newPassword"),
          val(pwdForm, "confirmPassword")
        );
        pwdForm.reset();
        passwordCard.classList.add("hidden");
        toast("Sua nova senha já está valendo.", "success", "Senha alterada");
      } catch (err) {
        showErrors(pwdForm, err.fields || {});
        if (!err.fields) toast(err.message, "error");
      }
    });

    // Sair
    ["#logout-btn", "#logout-btn-2"].forEach(function (selector) {
      var btn = $(selector);
      if (btn) btn.addEventListener("click", doLogout);
    });

    // Excluir conta
    $("#delete-account").addEventListener("click", async function () {
      var passwordCardNode = passwordCard;
      passwordCardNode.classList.remove("hidden");
      reveal(passwordCardNode);
      var confirmInput = pwdFormDelete();
      if (!confirmInput) return;
    });

    function pwdFormDelete() {
      if ($("#delete-confirm")) return $("#delete-confirm");
      var body = passwordCard.querySelector(".card-body");
      var box = document.createElement("div");
      box.className = "danger-box";
      box.innerHTML =
        "<p><strong>Excluir a conta apaga seus dados deste navegador.</strong> Não há como desfazer.</p>" +
        '<div class="control">' + Icons.icon("lock", 17) +
        '<input id="delete-confirm" type="password" placeholder="Digite sua senha para confirmar">' +
        "</div>" +
        '<span class="error-slot" data-error="password"></span>' +
        '<div class="form-actions"><button class="btn btn-danger" type="button" id="delete-go">Excluir definitivamente</button>' +
        '<button class="btn btn-ghost" type="button" id="delete-cancel">Cancelar</button></div>';
      body.appendChild(box);
      $("#delete-cancel").addEventListener("click", function () { box.remove(); });
      $("#delete-go").addEventListener("click", async function () {
        try {
          await store.deleteAccount($("#delete-confirm").value);
          toast("Conta excluída deste navegador.", "success");
          go("login");
          render();
        } catch (err) {
          showErrors(box, err.fields || {});
          if (!err.fields) toast(err.message, "error");
        }
      });
      return $("#delete-confirm");
    }

    // Chip "tudo salvo" reflete a última gravação
    var unsub = store.subscribe(function () {
      if (photoState.saved) flashSaved();
    });
    void unsub;
    void account;
  }

  var saveTimer = null;
  function flashSaved() {
    var chip = $("#save-chip");
    if (!chip) return;
    chip.classList.add("pulse");
    chip.innerHTML = Icons.icon("check", 14) + "<span>Salvo agora</span>";
    photoState.saved = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!chip) return;
      chip.classList.remove("pulse");
      chip.innerHTML = Icons.icon("check", 14) + "<span>Tudo salvo</span>";
    }, 2600);
  }

  async function doLogout() {
    await store.logout();
    pendingPhoto = null;
    toast("Você saiu. Seus dados continuam salvos.", "success", "Até logo");
    go("login");
    render();
  }

  /* ================================ BOOT ================================ */

  async function boot() {
    bootChrome();
    db = lib.createDB();
    await db.init();
    store = lib.createStore({ db: db, hash: hash, core: core, crypto: window.crypto });

    try {
      await store.load();
    } catch (err) {
      toast("Não conseguimos acessar o armazenamento do navegador.", "error");
    }

    window.addEventListener("hashchange", render);
    document.addEventListener("click", function (event) {
      var toggle = event.target.closest ? event.target.closest("[data-theme-toggle]") : null;
      if (toggle) { toggleTheme(); return; }
      var link = event.target.closest ? event.target.closest('a[href^="#"]') : null;
      if (link) {
        event.preventDefault();
        go(link.getAttribute("href").slice(1));
      }
    });

    render();
    document.body.removeAttribute("data-booting");

    // Garante que a interface reflita mudanças de outra aba
    window.addEventListener("storage", async function (event) {
      if (event.key && event.key.indexOf("conta:") === 0) {
        await store.load();
        render();
      }
    });
    void sleep;
  }

  window.App = {
    boot: boot,
    render: render,
    store: function () { return store; },
    go: go
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
