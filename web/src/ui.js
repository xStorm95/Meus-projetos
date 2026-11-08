/*
 * Componentes de interface (DOM puro): toasts, modais, avatar, gráficos e
 * utilitários de formulário. Sem framework — leve e previsível.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PassarelaUI = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var core = typeof module === "object" && module.exports ? require("./core.js") : null;

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") {
          Object.keys(value).forEach(function (dataKey) {
            node.dataset[dataKey] = value[dataKey];
          });
        } else if (key.slice(0, 2) === "on" && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) node.setAttribute(key, "");
        else node.setAttribute(key, value);
      });
    }
    if (children !== null && children !== undefined) {
      (Array.isArray(children) ? children : [children]).forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  function escapeHtml(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------------------- TOASTS ---------------------------- */

  var ICON = {
    success: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
    warning: '<path d="M10.3 3.6 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'
  };

  function toast(message, type, title) {
    var container = $("#toasts");
    if (!container) return;
    var kind = type || "info";
    var node = el("div", { class: "toast " + kind, role: "status" });
    node.innerHTML =
      '<span class="toast-icon"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON[kind] || ICON.info) + "</svg></span>" +
      '<div><div class="toast-title">' + escapeHtml(title || { success: "Tudo certo", error: "Ops", info: "Aviso", warning: "Atenção" }[kind]) +
      '</div><div class="toast-msg">' + escapeHtml(message) + "</div></div>";
    container.appendChild(node);
    var remove = function () {
      node.classList.add("out");
      setTimeout(function () {
        if (node.parentNode) node.parentNode.removeChild(node);
      }, 220);
    };
    setTimeout(remove, kind === "error" ? 5200 : 3400);
  }

  /* ---------------------------- MODAIS ---------------------------- */

  var openModalNode = null;

  function closeModal() {
    if (!openModalNode) return;
    var node = openModalNode;
    openModalNode = null;
    node.style.opacity = "0";
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 160);
    document.removeEventListener("keydown", onModalKey);
  }

  function onModalKey(event) {
    if (event.key === "Escape") closeModal();
  }

  /**
   * openModal({ title, body(Node), footer(Node|Array), size, onClose })
   */
  function openModal(options) {
    closeModal();
    var opts = options || {};
    var backdrop = el("div", { class: "modal-backdrop" });
    var modal = el("div", { class: "modal " + (opts.size || ""), role: "dialog", "aria-modal": "true" });
    var head = el("div", { class: "modal-head" });
    head.appendChild(
      el("div", {}, [
        el("h3", { text: opts.title || "" }),
        opts.description ? el("p", { class: "tiny muted mt-8", text: opts.description }) : null
      ])
    );
    head.appendChild(
      el("button", {
        class: "btn btn-ghost btn-icon",
        type: "button",
        "aria-label": "Fechar",
        html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        onclick: function () {
          closeModal();
          if (opts.onClose) opts.onClose();
        }
      })
    );
    modal.appendChild(head);
    var body = el("div", { class: "modal-body" });
    if (opts.body) body.appendChild(opts.body);
    modal.appendChild(body);
    if (opts.footer) {
      var foot = el("div", { class: "modal-foot" });
      (Array.isArray(opts.footer) ? opts.footer : [opts.footer]).forEach(function (child) {
        if (child) foot.appendChild(child);
      });
      modal.appendChild(foot);
    }
    backdrop.appendChild(modal);
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) {
        closeModal();
        if (opts.onClose) opts.onClose();
      }
    });
    document.body.appendChild(backdrop);
    openModalNode = backdrop;
    document.addEventListener("keydown", onModalKey);
    var firstInput = modal.querySelector("input, select, textarea, button");
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
    return { close: closeModal, node: modal, body: body };
  }

  function confirmDialog(options) {
    return new Promise(function (resolve) {
      var opts = options || {};
      var footer = [
        el("button", { class: "btn btn-outline", type: "button", text: opts.cancelLabel || "Cancelar", onclick: function () { closeModal(); resolve(false); } }),
        el("button", {
          class: "btn " + (opts.danger ? "btn-danger" : "btn-primary"),
          type: "button",
          text: opts.confirmLabel || "Confirmar",
          onclick: function () { closeModal(); resolve(true); }
        })
      ];
      openModal({
        title: opts.title || "Confirmar",
        size: "small",
        body: el("p", { class: "small muted", text: opts.message || "" }),
        footer: footer,
        onClose: function () { resolve(false); }
      });
    });
  }

  /** Modal de campo único (usado no motivo de cancelamento). */
  function promptDialog(options) {
    return new Promise(function (resolve) {
      var opts = options || {};
      var input = el("textarea", { class: "textarea", placeholder: opts.placeholder || "" });
      var body = el("div", { class: "stack" }, [el("div", { class: "field" }, [el("label", { text: opts.label || "Motivo" }), input])]);
      openModal({
        title: opts.title || "Informe o motivo",
        size: "small",
        body: body,
        footer: [
          el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { closeModal(); resolve(null); } }),
          el("button", { class: "btn btn-primary", type: "button", text: opts.confirmLabel || "Confirmar", onclick: function () { closeModal(); resolve(input.value.trim()); } })
        ],
        onClose: function () { resolve(null); }
      });
    });
  }

  /* ---------------------------- AVATAR ---------------------------- */

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function avatarHtml(user, size) {
    var cls = "avatar avatar-" + (size || "md");
    if (user && user.avatar) {
      return '<span class="' + cls + '"><img src="' + escapeHtml(user.avatar) + '" alt="Foto de ' + escapeHtml(user.name || "") + '"></span>';
    }
    return '<span class="' + cls + '">' + escapeHtml(initials(user && user.name)) + "</span>";
  }

  /** Lê um arquivo de imagem, redimensiona (máx. 512px) e devolve data URL JPEG/PNG. */
  function readImageFile(file, maxSize) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("Nenhum arquivo selecionado."));
      if (!/^image\//.test(file.type)) return reject(new Error("Selecione um arquivo de imagem (JPG, PNG ou WEBP)."));
      if (file.size > 12 * 1024 * 1024) return reject(new Error("Imagem muito grande (máximo 12 MB)."));
      var limit = maxSize || 512;
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Não foi possível ler o arquivo.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("Arquivo de imagem inválido.")); };
        img.onload = function () {
          var scale = Math.min(1, limit / Math.max(img.width, img.height));
          var width = Math.max(1, Math.round(img.width * scale));
          var height = Math.max(1, Math.round(img.height * scale));
          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          // Fundo branco para PNGs transparentes não virarem preto no JPEG
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------- GRÁFICOS ---------------------------- */

  /** Barras simples em HTML/CSS. data: [{ label, value }] */
  function barsChart(data, options) {
    var opts = options || {};
    var rows = (data || []).slice(-14);
    if (!rows.length) {
      return '<div class="empty" style="padding:24px"><p>Sem dados no período.</p></div>';
    }
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r.value) || 0; }).concat([1]));
    var html = '<div class="chart-bars">';
    rows.forEach(function (row) {
      var height = Math.max(3, Math.round(((Number(row.value) || 0) / max) * 100));
      html +=
        '<div class="chart-col" title="' + escapeHtml(row.label + ": " + (opts.format ? opts.format(row.value) : row.value)) + '">' +
        '<div class="chart-bar" style="height:' + height + '%"><span class="chart-value">' +
        escapeHtml(opts.format ? opts.format(row.value) : String(row.value)) + "</span></div>" +
        '<span class="chart-label">' + escapeHtml(row.label) + "</span></div>";
    });
    html += "</div>";
    return html;
  }

  function donut(pairs) {
    var list = (pairs || []).filter(function (p) { return Number(p.value) > 0; });
    if (!list.length) return '<div class="empty" style="padding:20px"><p>Sem dados.</p></div>';
    var total = list.reduce(function (acc, p) { return acc + Number(p.value); }, 0);
    var colors = ["#b08d3f", "#c07f86", "#2f7a5f", "#2c4a7c", "#a5651a", "#6b6660"];
    var angle = 0;
    var stops = list.map(function (p, index) {
      var start = angle;
      angle += (Number(p.value) / total) * 360;
      return colors[index % colors.length] + " " + start.toFixed(1) + "deg " + angle.toFixed(1) + "deg";
    });
    var html = '<div class="row gap-16 wrap"><div style="width:104px;height:104px;border-radius:50%;background:conic-gradient(' +
      stops.join(",") + ');position:relative;flex-shrink:0"><div style="position:absolute;inset:26px;border-radius:50%;background:var(--bg-elevated)"></div></div><div class="stack gap-4" style="min-width:120px">';
    list.forEach(function (p, index) {
      html += '<div class="row gap-8 tiny"><span style="width:9px;height:9px;border-radius:3px;background:' +
        colors[index % colors.length] + '"></span><span class="grow">' + escapeHtml(p.label) +
        '</span><span class="mono bold">' + (Math.round((Number(p.value) / total) * 100)) + "%</span></div>";
    });
    html += "</div></div>";
    return html;
  }

  /** Gráfico de área suave (SVG) — tendência de faturamento. */
  function areaChart(rows, options) {
    var opts = options || {};
    var data = (rows || []).map(function (r) {
      return { label: r.label, value: Number(r.value) || 0 };
    });
    if (data.length < 2) {
      return '<div class="empty" style="padding:26px"><p>Registre vendas para ver a curva.</p></div>';
    }
    var w = 620;
    var h = 150;
    var pad = 8;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var stepX = (w - pad * 2) / (data.length - 1);
    var points = data.map(function (d, i) {
      var x = pad + i * stepX;
      var y = h - pad - (d.value / max) * (h - pad * 2);
      return { x: x, y: y, d: d };
    });

    // curva suave (Catmull-Rom → Bézier)
    var path = "M" + points[0].x.toFixed(1) + " " + points[0].y.toFixed(1);
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[i - 1] || points[i];
      var p1 = points[i];
      var p2 = points[i + 1];
      var p3 = points[i + 2] || p2;
      var c1x = p1.x + (p2.x - p0.x) / 6;
      var c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6;
      var c2y = p2.y - (p3.y - p1.y) / 6;
      path += " C" + c1x.toFixed(1) + " " + c1y.toFixed(1) + ", " + c2x.toFixed(1) + " " + c2y.toFixed(1) + ", " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
    }
    var area = path + " L" + points[points.length - 1].x.toFixed(1) + " " + (h - pad) + " L" + points[0].x.toFixed(1) + " " + (h - pad) + " Z";
    var id = "grad" + Math.random().toString(36).slice(2, 8);

    var html = '<svg class="area-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="Tendência de faturamento">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#c9a44f" stop-opacity=".42"/><stop offset="100%" stop-color="#c9a44f" stop-opacity="0"/></linearGradient></defs>' +
      '<path class="area-fill" d="' + area + '" fill="url(#' + id + ')"/>' +
      '<path class="area-line" d="' + path + '" fill="none" stroke="#b08d3f" stroke-width="2.4" stroke-linecap="round"/>';

    points.forEach(function (p, index) {
      if (index % Math.ceil(points.length / 8) !== 0 && index !== points.length - 1) return;
      html += '<circle class="area-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.2">' +
        '<title>' + escapeHtml(p.d.label + ": " + (opts.format ? opts.format(p.d.value) : p.d.value)) + "</title></circle>";
    });
    html += "</svg>";

    html += '<div class="area-labels">';
    data.forEach(function (d, i) {
      if (i % Math.ceil(data.length / 7) !== 0 && i !== data.length - 1) return;
      html += '<span>' + escapeHtml(d.label) + "</span>";
    });
    html += "</div>";
    return html;
  }

  /**
   * Calendário mensal com marcação de dias (caixa aberto, vendas, faturamento).
   * summaryFn(dateKey) → { open, salesCount, revenue }
   */
  function calendar(monthKey, summaryFn, options) {
    var opts = options || {};
    var parts = String(monthKey).split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var startWeekday = first.getDay();
    var todayKey = new Date().toISOString().slice(0, 10);
    var selected = opts.selected || null;

    var monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    var html = '<div class="cal-head"><button class="cal-nav" data-cal="prev" aria-label="Mês anterior">‹</button>' +
      '<strong>' + monthNames[month] + " de " + year + "</strong>" +
      '<button class="cal-nav" data-cal="next" aria-label="Próximo mês">›</button></div>';

    html += '<div class="cal-week">' + ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map(function (d) {
      return "<span>" + d + "</span>";
    }).join("") + "</div>";

    html += '<div class="cal-grid">';
    for (var i = 0; i < startWeekday; i++) html += '<span class="cal-empty"></span>';

    for (var day = 1; day <= daysInMonth; day++) {
      var key = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      var summary = summaryFn ? summaryFn(key) : null;
      var classes = ["cal-day"];
      if (key === todayKey) classes.push("is-today");
      if (key === selected) classes.push("is-selected");
      if (summary && summary.open) classes.push("has-open");
      if (summary && summary.salesCount > 0) classes.push("has-sales");
      if (summary && summary.revenue > 0) classes.push("has-money");

      var title = key;
      if (summary && summary.salesCount) {
        title += " · " + summary.salesCount + " venda(s) · " + (opts.format ? opts.format(summary.revenue) : summary.revenue);
      }
      if (summary && summary.open) title += " · caixa aberto";

      html += '<button class="' + classes.join(" ") + '" data-cal-day="' + key + '" title="' + escapeHtml(title) + '">' +
        '<span class="cal-num">' + day + "</span>" +
        (summary && summary.open ? '<span class="cal-flag">aberto</span>' : "") +
        (summary && summary.revenue > 0 ? '<span class="cal-dot"></span>' : "") +
        "</button>";
    }
    html += "</div>";
    return html;
  }

  /* ---------------------------- MÁSCARAS ---------------------------- */

  function applyMask(input, maskFn) {
    if (!input) return;
    input.addEventListener("input", function () {
      var position = input.selectionStart;
      var before = input.value.length;
      input.value = maskFn(input.value);
      var after = input.value.length;
      if (position !== null) input.setSelectionRange(position + (after - before), position + (after - before));
    });
  }

  function phoneMask(value) {
    var v = String(value || "").replace(/\D/g, "").slice(0, 11);
    if (v.length <= 10) return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return v.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  }

  function cpfMask(value) {
    var v = String(value || "").replace(/\D/g, "").slice(0, 11);
    return v.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }

  /* ---------------------------- DOWNLOADS ---------------------------- */

  function downloadBlob(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = el("a", { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      if (link.parentNode) link.parentNode.removeChild(link);
    }, 400);
  }

  function downloadFile(filename, content, mime) {
    // BOM garante acentuação correta no Excel
    if (/csv/.test(mime || "")) downloadBlob(filename, "\uFEFF" + content, mime);
    else downloadBlob(filename, content, mime);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var area = el("textarea", { style: "position:fixed;opacity:0" });
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* ignora */
    }
    document.body.removeChild(area);
    return Promise.resolve();
  }

  /* ---------------------------- FORM HELPERS ---------------------------- */

  function fieldError(name, message) {
    var node = document.querySelector('[data-error="' + name + '"]');
    if (node) node.textContent = message || "";
    var input = document.querySelector('[name="' + name + '"]');
    if (input) input.classList.toggle("invalid", Boolean(message));
  }

  function clearErrors(scope) {
    $$("[data-error]", scope).forEach(function (node) { node.textContent = ""; });
    $$(".invalid", scope).forEach(function (node) { node.classList.remove("invalid"); });
  }

  function showFieldErrors(errors, scope) {
    clearErrors(scope);
    Object.keys(errors || {}).forEach(function (key) {
      fieldError(key, errors[key]);
    });
    var first = Object.keys(errors || {})[0];
    if (first) {
      var input = document.querySelector('[name="' + first + '"]');
      if (input) input.focus();
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 220);
    };
  }

  function emptyState(iconHtml, title, message, actionHtml) {
    return (
      '<div class="empty"><div class="empty-icon">' + iconHtml + "</div><h3>" + escapeHtml(title) +
      "</h3><p>" + escapeHtml(message) + "</p>" + (actionHtml || "") + "</div>"
    );
  }

  return {
    $: $,
    $$: $$,
    el: el,
    escapeHtml: escapeHtml,
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    promptDialog: promptDialog,
    initials: initials,
    avatarHtml: avatarHtml,
    readImageFile: readImageFile,
    barsChart: barsChart,
    areaChart: areaChart,
    calendar: calendar,
    donut: donut,
    applyMask: applyMask,
    phoneMask: phoneMask,
    cpfMask: cpfMask,
    downloadBlob: downloadBlob,
    downloadFile: downloadFile,
    copyText: copyText,
    fieldError: fieldError,
    clearErrors: clearErrors,
    showFieldErrors: showFieldErrors,
    debounce: debounce,
    emptyState: emptyState
  };
});
