/*
 * PALCO — ERP de moda · aplicação (DOM puro)
 * Depende de: core.js, hash.js, db.js, store.js, ui.js, icons.js
 */
(function () {
  "use strict";

  var core = window.PassarelaCore;
  var hash = window.PassarelaHash;
  var dbLib = window.PassarelaDB;
  var storeLib = window.PassarelaStore;
  var ui = window.PassarelaUI;
  var Icons = window.Icons;

  var store = null;
  var session = { user: null };
  var view = "dashboard";
  var cart = [];
  var aux = { cashMonth: new Date().toISOString().slice(0, 7), cashDay: null, cashTab: "atual" };

  var NAV = [
    { group: "Operação", items: [
      { id: "dashboard", label: "Painel", icon: "dashboard" },
      { id: "pos", label: "PDV", icon: "pos" },
      { id: "cash", label: "Caixa", icon: "wallet" },
      { id: "sales", label: "Vendas", icon: "sales" },
      { id: "products", label: "Produtos", icon: "products" },
      { id: "customers", label: "Clientes", icon: "customers" }
    ]},
    { group: "Gestão", items: [
      { id: "finance", label: "Financeiro", icon: "finance" },
      { id: "reports", label: "Relatórios", icon: "reports" }
    ]},
    { group: "Conta", items: [
      { id: "profile", label: "Meu perfil", icon: "profile" },
      { id: "settings", label: "Configurações", icon: "settings" }
    ]}
  ];

  /** Logo oficial (vetor, nítida em qualquer tamanho). */
  var LOGO_MARK = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%2216%200%20208%20208%22%20width%3D%22208%22%20height%3D%22208%22%20role%3D%22img%22%20aria-label%3D%22Passarela%20da%20Moda%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22goldFace%22%20x1%3D%220.1%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23e2cc93%22%2F%3E%3Cstop%20offset%3D%2245%25%22%20stop-color%3D%22%23cdb173%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%23a3854a%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22inkGrad%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%23403d38%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%231d1b18%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3C%21--%20moldura%20quadrada%20--%3E%3Crect%20x%3D%2234%22%20y%3D%2216%22%20width%3D%22172%22%20height%3D%22172%22%20rx%3D%225%22%20fill%3D%22none%22%20stroke%3D%22%23ada79c%22%20stroke-width%3D%222.4%22%2F%3E%3C%21--%20coluna%20dourada%20em%20perspectiva%20--%3E%3Cpath%20d%3D%22M66%2046%20L106%2060%20L106%20172%20L66%20158%20Z%22%20fill%3D%22url%28%23goldFace%29%22%2F%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22url%28%23inkGrad%29%22%20stroke-width%3D%228%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3C%21--%20haste%20vertical%20do%20P%20--%3E%3Cpath%20d%3D%22M106%2060%20L106%20172%22%2F%3E%3C%21--%20la%C3%A7ada%20do%20P%20--%3E%3Cpath%20d%3D%22M106%2072%20L134%2072%20C158%2072%20158%20118%20134%20118%20L106%20118%22%2F%3E%3C%21--%20haste%20direita%20%28sobe%20at%C3%A9%20o%20topo%29%20--%3E%3Cpath%20d%3D%22M134%20118%20L134%20172%22%2F%3E%3C%21--%20diagonal%20de%20cima%2C%20como%20um%20cabide%20--%3E%3Cpath%20d%3D%22M150%20172%20L188%2046%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E";

  var PAYMENT_LABELS = {
    DINHEIRO: "Dinheiro",
    PIX: "Pix",
    DEBITO: "Cartão de débito",
    CREDITO: "Cartão de crédito",
    TRANSFERENCIA: "Transferência",
    FIADO: "Fiado"
  };

  var CATEGORIES = ["Vestidos", "Blusas", "Camisetas", "Calças", "Saias", "Shorts", "Jaquetas", "Acessórios", "Calçados", "Outros"];
  var SIZES = ["PP", "P", "M", "G", "GG", "XG", "34", "36", "38", "40", "42", "44", "46", "Único"];

  /* ============================== BOOT ============================== */

  async function boot() {
    await dbLib.init();
    store = storeLib.createStore({ db: dbLib, hash: hash, core: core });
    await store.load();
    refreshFileState();
    applyTheme();
    render();
    // Re-renderiza quando os dados mudam (ex.: outra aba aberta)
    store.subscribe(function () {
      session.user = store.getUser();
    });
    window.addEventListener("storage", function (event) {
      if (event.key && event.key.indexOf("passarela") === 0) {
        store.load().then(render);
      }
    });
  }

  function applyTheme() {
    var settings = store.getState().settings || {};
    document.documentElement.setAttribute("data-accent", settings.accent || "gold");
    document.documentElement.setAttribute("data-theme", settings.theme === "dark" ? "dark" : "light");
  }

  /** Valor de um campo pelo atributo name (evita colisão com form.name). */
  function fieldValue(scope, name) {
    var node = scope && scope.querySelector ? scope.querySelector('[name="' + name + '"]') : null;
    return node ? node.value : "";
  }

  function render() {
    session.user = store.getUser();
    applyTheme();
    var root = document.getElementById("root");
    root.innerHTML = appView();
    bindApp();
  }

  /* ============================== AUTH ============================== */

  /* ============================== ARQUIVO DE DADOS ============================== */

  /** Estado do arquivo no computador, exibido na barra superior. */
  var fileState = { supported: false, linked: false, name: null, status: "off", message: "" };

  function refreshFileState() {
    fileState.supported = typeof dbLib.fileSupported === "function" && dbLib.fileSupported();
    var info = typeof dbLib.fileInfo === "function" ? dbLib.fileInfo() : { linked: false, name: null, status: "off" };
    fileState.linked = info.linked;
    fileState.name = info.name;
    fileState.status = info.status;
    return fileState;
  }

  /** Vincula (cria/abre) o arquivo de dados no computador. Precisa de clique do usuário. */
  async function linkDataFile() {
    var result = await dbLib.linkFile("passarela-da-moda.passarela.json");
    if (!result.ok) {
      if (result.reason === "unsupported") {
        ui.toast(
          "Este navegador não grava direto em arquivo. Use o Chrome ou o Edge, ou clique em Backup para baixar o arquivo.",
          "warning",
          "Sem gravação automática"
        );
      } else if (result.reason === "cancelled") {
        ui.toast("Nenhum arquivo foi escolhido.", "info");
      } else {
        ui.toast(result.message || "Não foi possível criar o arquivo.", "error");
      }
      return false;
    }
    refreshFileState();
    if (result.merged) {
      await store.refresh();
      ui.toast(
        "Dados carregados de " + result.name + " (" + result.entries + " produto(s)). Tudo passa a ser gravado nele.",
        "success",
        "Arquivo importado"
      );
    } else {
      ui.toast("Arquivo vinculado: " + result.name + ". Tudo agora é salvo nele automaticamente.", "success", "Salvando no computador");
      await dbLib.saveNow();
    }
    render();
    return true;
  }

  /** Reabre o arquivo já vinculado (o navegador pede permissão uma vez por sessão). */
  async function reopenDataFile() {
    var result = await dbLib.reopenFile(true);
    if (!result.ok) {
      if (result.reason === "none") {
        return linkDataFile();
      }
      ui.toast("Permissão não concedida para gravar no arquivo.", "warning");
      return false;
    }
    refreshFileState();
    await store.refresh();
    render();
    ui.toast(
      result.restored
        ? "Dados carregados de " + result.name + " (" + result.entries + " produto(s))."
        : "Arquivo reconectado: " + result.name + ". As alterações passam a ser gravadas nele.",
      "success",
      "Arquivo de dados"
    );
    return true;
  }

  function fileChip() {
    refreshFileState();
    if (!fileState.supported) {
      return '<button class="storage-chip chip-warn" data-action="download-backup" title="Baixar o arquivo de dados">' +
        Icons.icon("download", 14) + " <span>Baixar arquivo manualmente</span></button>";
    }
    if (!fileState.linked) {
      return '<button class="storage-chip chip-warn" data-action="link-file" title="Escolher o arquivo onde os dados são salvos">' +
        Icons.icon("database", 14) + " <span>Escolher arquivo de dados</span></button>";
    }
    var ok = fileState.status !== "error";
    return '<button class="storage-chip ' + (ok ? "chip-ok" : "chip-warn") + '" data-action="file-panel" title="' +
      ui.escapeHtml(fileState.name || "") + '">' + Icons.icon("check", 14) + " <span>Salvando em " +
      ui.escapeHtml(fileState.name || "arquivo") + "</span></button>";
  }

  /* ============================== SHELL ============================== */

  function appView() {
    var settings = store.getState().settings || {};
    var sales = store.listSales().filter(function (s) { return s.status === "CONCLUIDA"; });
    var lowStock = store.getState().products.filter(function (p) {
      return p.stock <= Number(settings.lowStockThreshold || 3);
    });
    var counts = { sales: sales.length, products: store.getState().products.length, customers: store.getState().customers.length };

    var nav = NAV.map(function (group) {
      return (
        '<div class="nav-label">' + ui.escapeHtml(group.group) + "</div>" +
        group.items.map(function (item) {
          var count = item.id === "products" ? counts.products : item.id === "sales" ? counts.sales : item.id === "customers" ? counts.customers : null;
          return (
            '<button class="nav-item' + (view === item.id ? " active" : "") + '" data-nav="' + item.id + '">' +
            Icons.icon(item.icon, 17) + "<span>" + ui.escapeHtml(item.label) + "</span>" +
            (count ? '<span class="nav-count">' + count + "</span>" : "") +
            "</button>"
          );
        }).join("")
      );
    }).join("");

    var alertBadge = lowStock.length
      ? '<button class="btn btn-soft btn-sm" data-nav="products">' + Icons.icon("alert", 14) + " " + lowStock.length + " com estoque baixo</button>"
      : "";

    return (
      '<div class="app-shell">' +
        '<aside class="sidebar">' +
          '<div class="sidebar-logo"><img class="brand-mark-img" src="' + LOGO_MARK + '" alt=""><span class="sidebar-logo-text">Passarela<small>da Moda</small></span></div>' +
          '<div class="sidebar-store">' + ui.escapeHtml(settings.storeName || "Passarela da Moda") + "</div>" +
          '<nav class="nav">' + nav + "</nav>" +
          '<div class="sidebar-foot">' +
            fileChip() +
            '<div class="storage-note">' + ui.escapeHtml(storageLabel()) + "</div>" +
          "</div>" +
        "</aside>" +
        '<div class="main">' +
          '<header class="topbar">' +
            "<div><h1>" + ui.escapeHtml(viewTitle()) + "</h1>" +
            '<p class="topbar-sub">' + ui.escapeHtml(core.greeting()) + ", " + ui.escapeHtml(session.user.name.split(" ")[0]) + " · " + ui.escapeHtml(core.formatDateBR(core.todayKey())) + "</p></div>" +
            '<div class="topbar-search">' + alertBadge + "</div>" +
            '<button class="avatar-btn" data-nav="profile" title="Meu perfil">' + ui.avatarHtml(session.user, "sm") + "</button>" +
          "</header>" +
          '<main class="view" id="view">' + renderView() + "</main>" +
        "</div>" +
      "</div>" +
      '<div class="toasts" id="toasts"></div>'
    );
  }

  /** Backup manual: baixa o .json com tudo (inclusive fotos). */
  async function downloadBackup() {
    var dump = await store.exportAll();
    ui.downloadFile("passarela-da-moda-" + core.todayKey() + ".json", JSON.stringify(dump, null, 2), "application/json");
    ui.toast("Backup baixado. Guarde o arquivo numa pasta segura.", "success");
  }

  function lastSavedLabel() {
    var savedAt = store.getState().settings && store.getState().settings.savedAt;
    var stamp = savedAt || (typeof dbLib.fileInfo === "function" ? null : null);
    return stamp ? core.relativeTime(stamp) : "agora";
  }

  function storageLabel() {
    var driver = dbLib.driver();
    if (driver === "cloud") return "Nuvem (PostgreSQL)";
    if (driver === "indexeddb") return "IndexedDB ativo";
    if (driver === "localstorage") return "Armazenamento local";
    return "Modo temporário";
  }

  function viewTitle() {
    var map = {
      dashboard: "Painel",
      pos: "PDV — Ponto de venda",
      cash: "Caixa",
      sales: "Vendas",
      products: "Produtos",
      customers: "Clientes",
      finance: "Financeiro",
      reports: "Relatórios",
      profile: "Meu perfil",
      settings: "Configurações"
    };
    return map[view] || "Painel";
  }

  function bindApp() {
    ui.$$("[data-nav]").forEach(function (node) {
      node.addEventListener("click", function () {
        navigate(node.dataset.nav);
      });
    });
    bindView();
  }

  function navigate(target) {
    if (target === view) return;
    view = target;
    cart = [];
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderView() {
    switch (view) {
      case "pos": return posView();
      case "cash": return cashView();
      case "sales": return salesView();
      case "products": return productsView();
      case "customers": return customersView();
      case "finance": return financeView();
      case "reports": return reportsView();
      case "profile": return profileView();
      case "settings": return settingsView();
      default: return dashboardView();
    }
  }

  function bindView() {
    switch (view) {
      case "pos": return bindPos();
      case "cash": return bindCash();
      case "sales": return bindSimple();
      case "products": return bindSimple();
      case "customers": return bindSimple();
      case "finance": return bindSimple();
      case "reports": return bindReports();
      case "profile": return bindProfile();
      case "settings": return bindSettings();
      default: return bindSimple();
    }
  }

  /* ============================== DASHBOARD ============================== */

  function dashboardView() {
    var data = store.dashboard();
    var settings = store.getState().settings || {};
    var hasData = data.productsCount > 0 || data.salesCount > 0;

    var kpis =
      kpi("Faturamento", core.brl(data.revenue), "total das vendas", "finance", "") +
      kpi("Lucro do período", core.brl(data.profit), "receita − custo − despesas", "trendUp", data.profit >= 0 ? "success" : "danger") +
      kpi("Vendas", String(data.salesCount), "ticket médio " + core.brl(data.ticket), "sales", "info") +
      kpi("A receber (fiado)", core.brl(data.openDebt), "saldo em aberto", "wallet", data.openDebt > 0 ? "danger" : "");

    var chart = ui.areaChart(
      data.byDay.slice(-14),
      { format: function (value) { return core.brl(value); } }
    );

    var cash = store.activeCashSession();
    var cashTotalsNow = cash ? store.cashTotals(cash) : null;
    var cashStrip =
      '<div class="cash-strip ' + (cash ? "is-open" : "is-closed") + '">' +
        '<div class="cash-strip-icon">' + Icons.icon(cash ? "wallet" : "lock", 18) + "</div>" +
        '<div class="cash-strip-body">' +
          "<strong>" + (cash ? "Caixa aberto desde " + ui.escapeHtml(core.formatTimeBR(cash.openedAt)) : "Caixa fechado") + "</strong>" +
          '<span class="tiny faint">' + (cash
            ? "gaveta com " + core.brl(cashTotalsNow.cashInDrawer) + " · " + cashTotalsNow.salesCount + " venda(s) neste caixa"
            : "abrir o caixa deixa as vendas em dinheiro organizadas por turno") + "</span>" +
        "</div>" +
        '<button class="btn btn-sm ' + (cash ? "btn-outline" : "btn-primary") + '" data-nav="cash">' +
          (cash ? "Ver caixa" : "Abrir caixa") + "</button>" +
      "</div>";

    var recent = data.recentSales.length
      ? data.recentSales.map(function (sale) {
          return (
            '<div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--border)">' +
              '<div><div class="small bold">' + ui.escapeHtml(sale.code) + "</div>" +
              '<div class="tiny faint">' + ui.escapeHtml(customerName(sale.customerId)) + " · " + ui.escapeHtml(core.formatDateTimeBR(sale.createdAt)) + "</div></div>" +
              '<div class="right"><div class="small bold mono">' + core.brl(sale.total) + "</div>" +
              '<div class="tiny faint">' + ui.escapeHtml(PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod) + "</div></div>" +
            "</div>"
          );
        }).join("")
      : ui.emptyState(Icons.icon("receipt", 22), "Nenhuma venda ainda", "Abra o PDV para registrar a primeira venda.");

    var lowList = data.lowStock.length
      ? data.lowStock.slice(0, 6).map(function (product) {
          return (
            '<div class="row-between" style="padding:8px 0">' +
              '<div class="row gap-8" style="min-width:0">' +
                thumb(product.photo, product.name) +
                '<div style="min-width:0"><div class="small bold" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ui.escapeHtml(product.name) + "</div>" +
                '<div class="tiny faint">' + ui.escapeHtml(product.sku) + "</div></div>" +
              "</div>" +
              '<span class="badge ' + (product.stock <= 0 ? "badge-danger" : "badge-warning") + '">' + product.stock + " un.</span>" +
            "</div>"
          );
        }).join("")
      : '<p class="small muted">Todos os produtos com estoque saudável.</p>';

    var topList = data.topProducts.length
      ? data.topProducts.map(function (item) {
          var max = data.topProducts[0].value || 1;
          return (
            '<div style="margin-bottom:10px">' +
              '<div class="row-between tiny" style="margin-bottom:4px"><span class="bold">' + ui.escapeHtml(item.key) + "</span>" +
              '<span class="mono">' + core.brl(item.value) + "</span></div>" +
              '<div class="progress"><span style="width:' + Math.round((item.value / max) * 100) + '%"></span></div>' +
            "</div>"
          );
        }).join("")
      : '<p class="small muted">As vendas do período aparecerão aqui.</p>';

    return (
      (hasData ? "" :
        '<div class="banner banner-accent mt-0" style="margin-bottom:14px">' + Icons.icon("sparkles", 18) +
        "<div><strong>Bem-vindo à Passarela da Moda!</strong> Comece cadastrando seus produtos e clientes — depois use o PDV para vender. " +
        '<div class="row gap-8 mt-8"><button class="btn btn-primary btn-sm" data-nav="products">Cadastrar produto</button>' +
        '<button class="btn btn-outline btn-sm" data-nav="customers">Cadastrar cliente</button></div></div></div>') +
      '<div class="grid grid-4">' + kpis + "</div>" +
      cashStrip +
      '<div class="grid mt-16" style="grid-template-columns:1.6fr 1fr">' +
        '<div class="card"><div class="card-head"><span class="card-title">Faturamento por dia</span>' +
          '<span class="badge badge-accent">' + ui.escapeHtml(settings.storeName || "Passarela da Moda") + "</span></div>" +
          '<div class="card-body">' + chart + "</div></div>" +
        '<div class="card"><div class="card-head"><span class="card-title">Mais vendidos</span></div>' +
          '<div class="card-body">' + topList + "</div></div>" +
      "</div>" +
      '<div class="grid mt-16" style="grid-template-columns:1.6fr 1fr">' +
        '<div class="card"><div class="card-head"><span class="card-title">Últimas vendas</span>' +
          '<button class="btn btn-ghost btn-sm" data-nav="sales">Ver todas</button></div>' +
          '<div class="card-body" style="padding-top:4px;padding-bottom:8px">' + recent + "</div></div>" +
        '<div class="card"><div class="card-head"><span class="card-title">Reposição de estoque</span>' +
          '<button class="btn btn-ghost btn-sm" data-nav="products">Gerenciar</button></div>' +
          '<div class="card-body">' + lowList + "</div></div>" +
      "</div>" +
      '<div class="grid grid-3 mt-16">' +
        quickAction("Nova venda", "Abrir o PDV", "pos", "pos") +
        quickAction("Novo produto", "Cadastrar peça", "products", "plus") +
        quickAction("Ver relatórios", "Analisar resultados", "reports", "reports") +
      "</div>"
    );
  }

  function quickAction(title, subtitle, target, icon) {
    return (
      '<button class="card card-pad row gap-16" data-nav="' + target + '" style="text-align:left;cursor:pointer">' +
      '<span class="kpi-icon">' + Icons.icon(icon, 18) + "</span>" +
      "<span><span class=\"small bold\" style=\"display:block\">" + ui.escapeHtml(title) + "</span>" +
      '<span class="tiny faint">' + ui.escapeHtml(subtitle) + "</span></span></button>"
    );
  }

  function kpi(label, value, foot, icon, tone) {
    return (
      '<div class="card kpi"><span class="kpi-icon ' + (tone || "") + '">' + Icons.icon(icon, 18) + "</span>" +
      '<div style="min-width:0"><div class="kpi-label">' + ui.escapeHtml(label) + "</div>" +
      '<div class="kpi-value">' + ui.escapeHtml(value) + "</div>" +
      '<div class="kpi-foot">' + ui.escapeHtml(foot) + "</div></div></div>"
    );
  }

  function thumb(photo, name) {
    if (photo) return '<span class="thumb"><img src="' + ui.escapeHtml(photo) + '" alt=""></span>';
    return '<span class="thumb">' + ui.escapeHtml(ui.initials(name)) + "</span>";
  }

  function customerName(id) {
    if (!id) return "Consumidor final";
    var found = store.getState().customers.find(function (c) { return c.id === id; });
    return found ? found.name : "Consumidor final";
  }

  /* ============================== PDV ============================== */

  function posView() {
    var search = (aux.posSearch || "").toLowerCase();
    var products = store.listProducts().filter(function (product) {
      if (!search) return true;
      return (
        product.name.toLowerCase().indexOf(search) > -1 ||
        String(product.sku).toLowerCase().indexOf(search) > -1 ||
        String(product.category).toLowerCase().indexOf(search) > -1
      );
    });

    var grid = products.length
      ? products.map(function (product) {
          var inCart = cart.find(function (item) { return item.productId === product.id; });
          return (
            '<button class="pos-card" data-add="' + product.id + '"' + (product.stock <= 0 ? " disabled" : "") + ">" +
              '<span class="pos-media">' + (product.photo ? '<img src="' + ui.escapeHtml(product.photo) + '" alt="">' : Icons.icon("tag", 26)) + "</span>" +
              '<span class="pos-body"><span class="pos-name">' + ui.escapeHtml(product.name) + "</span>" +
              '<span class="pos-meta">' + ui.escapeHtml([product.size, product.color].filter(Boolean).join(" · ") || product.category) + "</span>" +
              '<span class="row-between"><span class="pos-price">' + core.brl(product.price) + "</span>" +
              '<span class="badge ' + (product.stock <= 0 ? "badge-danger" : product.stock <= 3 ? "badge-warning" : "") + '">' + product.stock + "</span></span>" +
              (inCart ? '<span class="badge badge-accent" style="justify-self:start">no carrinho: ' + inCart.quantity + "</span>" : "") +
              "</span></button>"
          );
        }).join("")
      : ui.emptyState(Icons.icon("products", 22), "Nenhum produto encontrado", search ? "Tente outro termo de busca." : "Cadastre produtos para começar a vender.", '<button class="btn btn-primary btn-sm mt-8" data-nav="products">Cadastrar produto</button>');

    var totals = core.computeSaleTotals({
      items: cart.map(function (item) {
        var product = store.getState().products.find(function (p) { return p.id === item.productId; }) || { price: 0 };
        return { id: item.productId, unitPrice: product.price, quantity: item.quantity };
      }),
      discount: core.parseMoneyInput(aux.posDiscount || ""),
      paidAmount: core.parseMoneyInput(aux.posPaid || "")
    });

    var lines = cart.length
      ? cart.map(function (item) {
          var product = store.getState().products.find(function (p) { return p.id === item.productId; });
          if (!product) return "";
          return (
            '<div class="cart-line">' +
              '<div class="grow" style="min-width:0"><div class="cart-line-name">' + ui.escapeHtml(product.name) + "</div>" +
              '<div class="tiny faint">' + core.brl(product.price) + " cada</div></div>" +
              '<div class="qty"><button data-qty="-1" data-id="' + product.id + '">−</button><span>' + item.quantity + "</span>" +
              '<button data-qty="1" data-id="' + product.id + '">+</button></div>' +
              '<div class="small bold mono" style="width:74px;text-align:right">' + core.brl(product.price * item.quantity) + "</div>" +
            "</div>"
          );
        }).join("")
      : '<div class="empty" style="padding:32px 16px">' + Icons.icon("pos", 22).replace('class=', 'class=') +
        "<h3>Carrinho vazio</h3><p>Clique em um produto para adicionar.</p></div>";

    var customers = store.listCustomers();
    var customerOptions = '<option value="">Consumidor final</option>' + customers.map(function (c) {
      return '<option value="' + c.id + '"' + (aux.posCustomer === c.id ? " selected" : "") + ">" + ui.escapeHtml(c.name) + "</option>";
    }).join("");

    var paymentOptions = Object.keys(PAYMENT_LABELS).map(function (key) {
      return '<option value="' + key + '"' + ((aux.posPayment || "DINHEIRO") === key ? " selected" : "") + ">" + PAYMENT_LABELS[key] + "</option>";
    }).join("");

    return (
      '<div class="pos">' +
        '<div class="stack">' +
          '<div class="card card-pad"><div class="row gap-8 wrap">' +
            '<div class="input-group grow" style="min-width:220px"><span class="icon-left">' + Icons.icon("search", 16) + "</span>" +
            '<input class="input" id="pos-search" placeholder="Buscar por nome, SKU ou categoria..." value="' + ui.escapeHtml(aux.posSearch || "") + '"></div>' +
            '<button class="btn btn-outline btn-sm" data-nav="products">' + Icons.icon("plus", 14) + " Novo produto</button>" +
          "</div></div>" +
          '<div class="pos-grid">' + grid + "</div>" +
        "</div>" +
        '<div class="card cart">' +
          '<div class="card-head"><span class="card-title">Venda atual</span><span class="badge">' + totals.itemCount + " item(ns)</span></div>" +
          '<div class="cart-items">' + lines + "</div>" +
          '<div class="cart-summary">' +
            '<div class="field"><label>Cliente</label><select class="select" id="pos-customer">' + customerOptions + "</select></div>" +
            '<div class="grid grid-2" style="gap:8px">' +
              '<div class="field"><label>Forma de pagamento</label><select class="select" id="pos-payment">' + paymentOptions + "</select></div>" +
              '<div class="field"><label>Desconto (R$)</label><input class="input" id="pos-discount" inputmode="decimal" placeholder="0,00" value="' + ui.escapeHtml(aux.posDiscount || "") + '"></div>' +
            "</div>" +
            '<div class="sum-row"><span>Subtotal</span><span class="mono">' + core.brl(totals.subtotal) + "</span></div>" +
            (Number(totals.discount) > 0 ? '<div class="sum-row"><span>Desconto</span><span class="mono" style="color:var(--danger)">− ' + core.brl(totals.discount) + "</span></div>" : "") +
            '<div class="sum-row total"><span>Total</span><span class="mono">' + core.brl(totals.total) + "</span></div>" +
            '<div class="field"><label>Valor recebido</label><input class="input" id="pos-paid" inputmode="decimal" placeholder="' + core.brl(totals.total) + '" value="' + ui.escapeHtml(aux.posPaid || "") + '"></div>' +
            (Number(totals.change) > 0 ? '<div class="sum-row"><span>Troco</span><span class="mono" style="color:var(--success)">' + core.brl(totals.change) + "</span></div>" : "") +
            (Number(totals.balance) > 0 ? '<div class="sum-row"><span>Falta receber</span><span class="mono" style="color:var(--danger)">' + core.brl(totals.balance) + "</span></div>" : "") +
          "</div>" +
          '<div class="cart-actions">' +
            '<button class="btn btn-primary btn-lg btn-block" id="pos-finalize"' + (cart.length ? "" : " disabled") + ">" +
              Icons.icon("check", 17) + " Finalizar venda</button>" +
            '<div class="row gap-8">' +
              '<button class="btn btn-outline btn-sm grow" id="pos-clear"' + (cart.length ? "" : " disabled") + ">Limpar</button>" +
              '<button class="btn btn-ghost btn-sm grow" data-nav="sales">Ver vendas</button>' +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function bindPos() {
    var search = document.getElementById("pos-search");
    if (search) {
      search.addEventListener(
        "input",
        ui.debounce(function () {
          aux.posSearch = search.value;
          var position = search.selectionStart;
          document.getElementById("view").innerHTML = posView();
          bindPos();
          var next = document.getElementById("pos-search");
          if (next) {
            next.focus();
            next.setSelectionRange(position, position);
          }
        }, 180)
      );
    }

    ui.$$("[data-add]").forEach(function (button) {
      button.addEventListener("click", function () {
        addToCart(button.dataset.add);
      });
    });

    ui.$$("[data-qty]").forEach(function (button) {
      button.addEventListener("click", function () {
        changeQty(button.dataset.id, Number(button.dataset.qty));
      });
    });

    var customer = document.getElementById("pos-customer");
    if (customer) customer.addEventListener("change", function () { aux.posCustomer = customer.value; });

    var payment = document.getElementById("pos-payment");
    if (payment) payment.addEventListener("change", function () {
      aux.posPayment = payment.value;
      document.getElementById("view").innerHTML = posView();
      bindPos();
    });

    ["pos-discount", "pos-paid"].forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("change", function () {
        if (id === "pos-discount") aux.posDiscount = input.value;
        else aux.posPaid = input.value;
        document.getElementById("view").innerHTML = posView();
        bindPos();
      });
    });

    var finalize = document.getElementById("pos-finalize");
    if (finalize) finalize.addEventListener("click", finalizeSale);

    var clear = document.getElementById("pos-clear");
    if (clear) clear.addEventListener("click", function () {
      cart = [];
      aux.posPaid = "";
      aux.posDiscount = "";
      refreshPos();
    });
  }

  function refreshPos() {
    document.getElementById("view").innerHTML = posView();
    bindPos();
  }

  function addToCart(productId) {
    var product = store.getState().products.find(function (p) { return p.id === productId; });
    if (!product) return;
    var existing = cart.find(function (item) { return item.productId === productId; });
    if (existing) {
      if (existing.quantity >= product.stock) {
        ui.toast("Estoque disponível: " + product.stock + " un.", "warning", "Limite atingido");
        return;
      }
      existing.quantity += 1;
    } else {
      cart.push({ productId: productId, quantity: 1 });
    }
    refreshPos();
  }

  function changeQty(productId, delta) {
    var item = cart.find(function (line) { return line.productId === productId; });
    if (!item) return;
    var product = store.getState().products.find(function (p) { return p.id === productId; });
    var next = item.quantity + delta;
    if (next > Number(product.stock)) {
      ui.toast("Estoque disponível: " + product.stock + " un.", "warning");
      return;
    }
    if (next <= 0) cart = cart.filter(function (line) { return line.productId !== productId; });
    else item.quantity = next;
    refreshPos();
  }

  async function finalizeSale() {
    if (!cart.length) return;
    var paidText = aux.posPaid;
    var totals = core.computeSaleTotals({
      items: cart.map(function (item) {
        var product = store.getState().products.find(function (p) { return p.id === item.productId; });
        return { id: item.productId, unitPrice: product.price, quantity: item.quantity };
      }),
      discount: core.parseMoneyInput(aux.posDiscount || ""),
      paidAmount: core.parseMoneyInput(paidText || "")
    });
    var paid = paidText ? core.parseMoneyInput(paidText) : Number(totals.total);
    if (totals.balanceCents > 0) {
      var ok = await ui.confirmDialog({
        title: "Registrar como fiado?",
        message: "Faltam " + core.brl(totals.balance) + " para fechar a venda. Confirmar registra o saldo em aberto no nome do cliente.",
        confirmLabel: "Registrar fiado"
      });
      if (!ok) return;
    }
    try {
      var sale = await store.createSale({
        customerId: aux.posCustomer || null,
        items: cart.map(function (item) { return { productId: item.productId, quantity: item.quantity }; }),
        discount: core.parseMoneyInput(aux.posDiscount || ""),
        paidAmount: paid,
        paymentMethod: aux.posPayment || "DINHEIRO",
        allowDebt: true
      });
      cart = [];
      aux.posPaid = "";
      aux.posDiscount = "";
      render();
      ui.toast(sale.code + " concluída · " + core.brl(sale.total), "success", "Venda registrada");
      setTimeout(function () { openReceipt(sale.id); }, 220);
    } catch (err) {
      ui.toast(err.message, "error", "Não foi possível vender");
    }
  }

  /* ============================== VENDAS ============================== */

  function salesView() {
    var search = String(aux.salesSearch || "").toLowerCase();
    var sales = store.listSales().filter(function (sale) {
      if (!search) return true;
      return (
        String(sale.code).toLowerCase().indexOf(search) > -1 ||
        customerName(sale.customerId).toLowerCase().indexOf(search) > -1
      );
    });

    var rows = sales.length
      ? sales.map(function (sale) {
          var statusBadge = sale.status === "CANCELADA"
            ? '<span class="badge badge-danger">Cancelada</span>'
            : Number(sale.balance) > 0
              ? '<span class="badge badge-warning">Fiado</span>'
              : '<span class="badge badge-success">Paga</span>';
          return (
            "<tr>" +
              '<td><div class="bold">' + ui.escapeHtml(sale.code) + "</div>" +
              '<div class="tiny faint">' + ui.escapeHtml(core.formatDateTimeBR(sale.createdAt)) + "</div></td>" +
              "<td>" + ui.escapeHtml(customerName(sale.customerId)) + "</td>" +
              '<td class="tiny">' + sale.items.length + " item(ns)</td>" +
              '<td class="mono bold right">' + core.brl(sale.total) + "</td>" +
              '<td class="tiny">' + ui.escapeHtml(PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod) + "</td>" +
              "<td>" + statusBadge + "</td>" +
              '<td><div class="actions">' +
                '<button class="btn btn-ghost btn-icon" title="Recibo" data-receipt="' + sale.id + '">' + Icons.icon("receipt", 15) + "</button>" +
                (sale.status === "CONCLUIDA"
                  ? '<button class="btn btn-ghost btn-icon" title="Cancelar venda" data-cancel="' + sale.id + '">' + Icons.icon("xCircle", 15) + "</button>"
                  : "") +
              "</div></td>" +
            "</tr>"
          );
        }).join("")
      : '<tr><td colspan="7">' + ui.emptyState(Icons.icon("sales", 22), "Nenhuma venda registrada", "As vendas do PDV aparecem aqui.", '<button class="btn btn-primary btn-sm mt-8" data-nav="pos">Abrir PDV</button>') + "</td></tr>";

    return (
      '<div class="stack">' +
        '<div class="card card-pad"><div class="row gap-8 wrap">' +
          '<div class="input-group grow" style="min-width:220px"><span class="icon-left">' + Icons.icon("search", 16) + "</span>" +
          '<input class="input" id="sales-search" placeholder="Buscar por código ou cliente..." value="' + ui.escapeHtml(aux.salesSearch || "") + '"></div>' +
          '<button class="btn btn-primary btn-sm" data-nav="pos">' + Icons.icon("pos", 14) + " Nova venda</button>" +
        "</div></div>" +
        '<div class="card table-wrap"><table class="data"><thead><tr>' +
          "<th>Venda</th><th>Cliente</th><th>Itens</th><th class=\"right\">Total</th><th>Pagamento</th><th>Situação</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "</div>"
    );
  }

  /* ============================== PRODUTOS ============================== */

  function productsView() {
    var search = String(aux.productsSearch || "").toLowerCase();
    var category = aux.productsCategory || "";
    var products = store.listProducts().filter(function (product) {
      if (category && product.category !== category) return false;
      if (!search) return true;
      return (
        product.name.toLowerCase().indexOf(search) > -1 ||
        String(product.sku).toLowerCase().indexOf(search) > -1 ||
        String(product.category).toLowerCase().indexOf(search) > -1
      );
    });
    var settings = store.getState().settings || {};
    var threshold = Number(settings.lowStockThreshold || 3);

    var rows = products.length
      ? products.map(function (product) {
          return (
            "<tr>" +
              '<td><div class="row gap-8">' + thumb(product.photo, product.name) +
                '<div><div class="bold">' + ui.escapeHtml(product.name) + "</div>" +
                '<div class="tiny faint">' + ui.escapeHtml(product.sku) + " · " + ui.escapeHtml(product.category) + "</div></div></div></td>" +
              '<td class="tiny">' + ui.escapeHtml([product.color, product.size].filter(Boolean).join(" / ") || "—") + "</td>" +
              '<td class="mono right">' + core.brl(product.price) + "</td>" +
              '<td class="mono right tiny faint">' + core.brl(product.cost) + "</td>" +
              '<td class="right"><span class="badge ' + (product.stock <= 0 ? "badge-danger" : product.stock <= threshold ? "badge-warning" : "badge-success") + '">' + product.stock + " un.</span></td>" +
              '<td><div class="actions">' +
                '<button class="btn btn-ghost btn-icon" title="Ajustar estoque" data-stock="' + product.id + '">' + Icons.icon("box", 15) + "</button>" +
                '<button class="btn btn-ghost btn-icon" title="Editar" data-edit-product="' + product.id + '">' + Icons.icon("edit", 15) + "</button>" +
                '<button class="btn btn-ghost btn-icon" title="Excluir" data-del-product="' + product.id + '">' + Icons.icon("trash", 15) + "</button>" +
              "</div></td>" +
            "</tr>"
          );
        }).join("")
      : '<tr><td colspan="6">' + ui.emptyState(Icons.icon("products", 22), "Nenhum produto cadastrado", "Cadastre a primeira peça para vender no PDV.", '<button class="btn btn-primary btn-sm mt-8" data-new-product>Cadastrar produto</button>') + "</td></tr>";

    var categories = {};
    store.listProducts().forEach(function (p) { categories[p.category] = (categories[p.category] || 0) + 1; });
    var categoryOptions = '<option value="">Todas as categorias</option>' + Object.keys(categories).sort().map(function (key) {
      return '<option value="' + ui.escapeHtml(key) + '"' + (category === key ? " selected" : "") + ">" + ui.escapeHtml(key) + " (" + categories[key] + ")</option>";
    }).join("");

    var totalStock = store.listProducts().reduce(function (acc, p) { return acc + Number(p.stock); }, 0);
    var inventoryValue = store.listProducts().reduce(function (acc, p) { return acc + Number(p.stock) * Number(p.cost); }, 0);

    return (
      '<div class="stack">' +
        '<div class="grid grid-3">' +
          kpi("Produtos ativos", String(store.getState().products.length), "no catálogo", "products", "") +
          kpi("Peças em estoque", String(totalStock), "somatório das unidades", "box", "info") +
          kpi("Capital em estoque", core.brl(inventoryValue), "custo × quantidade", "wallet", "success") +
        "</div>" +
        '<div class="card card-pad"><div class="row gap-8 wrap">' +
          '<div class="input-group grow" style="min-width:200px"><span class="icon-left">' + Icons.icon("search", 16) + "</span>" +
          '<input class="input" id="products-search" placeholder="Buscar produto, SKU ou categoria..." value="' + ui.escapeHtml(aux.productsSearch || "") + '"></div>' +
          '<select class="select" id="products-category" style="max-width:220px">' + categoryOptions + "</select>" +
          '<button class="btn btn-outline btn-sm" id="products-export">' + Icons.icon("download", 14) + " CSV</button>" +
          '<button class="btn btn-primary btn-sm" data-new-product>' + Icons.icon("plus", 14) + " Novo produto</button>" +
        "</div></div>" +
        '<div class="card table-wrap"><table class="data"><thead><tr>' +
          "<th>Produto</th><th>Variação</th><th class=\"right\">Preço</th><th class=\"right\">Custo</th><th class=\"right\">Estoque</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "</div>"
    );
  }

  function openProductForm(id) {
    var product = id ? store.getState().products.find(function (p) { return p.id === id; }) : null;
    aux.productPhoto = product ? product.photo : "";
    var body = ui.el("div", { class: "stack" });

    var photoBox = ui.el("div", { class: "row gap-16" });
    var preview = ui.el("div", { html: thumb(aux.productPhoto, product ? product.name : "Nova peça") });
    var drop = ui.el("label", { class: "dropzone grow", tabindex: "0" },
      [Icons.icon("upload", 18) + "<div class='small'><strong>Foto do produto</strong><br>Clique ou arraste uma imagem (JPG/PNG)</div>"]);
    var fileInput = ui.el("input", { type: "file", accept: "image/*", style: "display:none" });
    drop.appendChild(fileInput);
    drop.addEventListener("click", function (event) {
      if (event.target !== fileInput) fileInput.click();
    });
    fileInput.addEventListener("change", async function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      try {
        aux.productPhoto = await ui.readImageFile(fileInput.files[0], 560);
        preview.innerHTML = thumb(aux.productPhoto, "Produto");
        ui.toast("Foto carregada.", "success");
      } catch (err) {
        ui.toast(err.message, "error");
      }
    });
    drop.addEventListener("dragover", function (event) { event.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("drag"); });
    drop.addEventListener("drop", async function (event) {
      event.preventDefault();
      drop.classList.remove("drag");
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      try {
        aux.productPhoto = await ui.readImageFile(file, 560);
        preview.innerHTML = thumb(aux.productPhoto, "Produto");
        ui.toast("Foto carregada.", "success");
      } catch (err) {
        ui.toast(err.message, "error");
      }
    });
    photoBox.appendChild(preview);
    photoBox.appendChild(drop);
    body.appendChild(photoBox);

    function input(name, label, options) {
      var opts = options || {};
      var wrap = ui.el("div", { class: "field" }, [
        ui.el("label", { text: label }),
        ui.el("input", {
          class: "input",
          name: name,
          type: opts.type || "text",
          inputmode: opts.inputmode,
          placeholder: opts.placeholder || "",
          value: opts.value === undefined || opts.value === null ? "" : String(opts.value)
        }),
        ui.el("span", { class: "field-error", "data-error": name })
      ]);
      return wrap;
    }

    function select(name, label, options, value) {
      var el = ui.el("select", { class: "select", name: name });
      options.forEach(function (option) {
        var node = ui.el("option", { value: option, text: option });
        if (String(value || "") === String(option)) node.selected = true;
        el.appendChild(node);
      });
      return ui.el("div", { class: "field" }, [ui.el("label", { text: label }), el]);
    }

    var grid1 = ui.el("div", { class: "grid grid-2", style: "gap:12px" });
    grid1.appendChild(input("name", "Nome da peça *", { value: product ? product.name : "", placeholder: "Vestido midi floral" }));
    grid1.appendChild(input("sku", "SKU / código", { value: product ? product.sku : "", placeholder: "Deixe vazio para gerar" }));
    body.appendChild(grid1);

    var grid2 = ui.el("div", { class: "grid grid-3", style: "gap:12px" });
    grid2.appendChild(select("category", "Categoria", CATEGORIES, product ? product.category : "Vestidos"));
    grid2.appendChild(input("color", "Cor", { value: product ? product.color : "", placeholder: "Preto" }));
    grid2.appendChild(select("size", "Tamanho", ["", ].concat(SIZES), product ? product.size : ""));
    body.appendChild(grid2);

    var grid3 = ui.el("div", { class: "grid grid-3", style: "gap:12px" });
    grid3.appendChild(input("price", "Preço de venda (R$) *", { value: product ? product.price : "", inputmode: "decimal", placeholder: "199,90" }));
    grid3.appendChild(input("cost", "Custo (R$)", { value: product ? product.cost : "", inputmode: "decimal", placeholder: "80,00" }));
    grid3.appendChild(input("stock", "Estoque", { value: product ? product.stock : 0, type: "number" }));
    body.appendChild(grid3);

    var desc = ui.el("div", { class: "field" }, [
      ui.el("label", { text: "Descrição (opcional)" }),
      ui.el("textarea", { class: "textarea", name: "description", placeholder: "Tecido, caimento, dicas de uso..." })
    ]);
    if (product && product.description) desc.querySelector("textarea").value = product.description;
    body.appendChild(desc);

    var modal = ui.openModal({
      title: product ? "Editar produto" : "Novo produto",
      description: product ? "As alterações valem imediatamente no PDV." : "A foto ajuda a identificar a peça rapidamente no PDV.",
      body: body,
      size: "wide",
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary",
          type: "button",
          text: product ? "Salvar alterações" : "Cadastrar produto",
          onclick: async function (event) {
            var button = event.currentTarget;
            var values = {
              id: product ? product.id : undefined,
              name: body.querySelector('[name="name"]').value,
              sku: body.querySelector('[name="sku"]').value,
              category: body.querySelector('[name="category"]').value,
              color: body.querySelector('[name="color"]').value,
              size: body.querySelector('[name="size"]').value,
              price: core.parseMoneyInput(body.querySelector('[name="price"]').value),
              cost: core.parseMoneyInput(body.querySelector('[name="cost"]').value),
              stock: body.querySelector('[name="stock"]').value,
              description: body.querySelector('[name="description"]').value,
              photo: aux.productPhoto || ""
            };
            if (!values.name || values.name.trim().length < 2) {
              return ui.showFieldErrors({ name: "Informe o nome do produto." }, body);
            }
            if (!values.price || values.price <= 0) {
              return ui.showFieldErrors({ price: "Informe o preço de venda." }, body);
            }
            button.disabled = true;
            try {
              await store.saveProduct(values);
              ui.closeModal();
              render();
              ui.toast(product ? "Produto atualizado." : "Produto cadastrado.", "success");
            } catch (err) {
              button.disabled = false;
              if (err.fields) ui.showFieldErrors(err.fields, body);
              else ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
    void modal;
  }

  function openStockDialog(id) {
    var product = store.getState().products.find(function (p) { return p.id === id; });
    if (!product) return;
    var body = ui.el("div", { class: "stack" });
    body.appendChild(ui.el("div", { class: "banner banner-info", html: Icons.icon("info", 16) + "<div>Estoque atual de <strong>" + ui.escapeHtml(product.name) + "</strong>: <strong>" + product.stock + " un.</strong></div>" }));
    body.appendChild(ui.el("div", { class: "grid grid-2", style: "gap:12px" }, [
      ui.el("div", { class: "field" }, [ui.el("label", { text: "Entrada (+) ou saída (−)" }), ui.el("input", { class: "input", name: "delta", type: "number", value: 1 })]),
      ui.el("div", { class: "field" }, [ui.el("label", { text: "Motivo" }), ui.el("input", { class: "input", name: "reason", placeholder: "Compra de fornecedor, perda, ajuste..." })])
    ]));
    ui.openModal({
      title: "Ajustar estoque",
      size: "small",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: "Aplicar",
          onclick: async function () {
            var delta = Number(body.querySelector('[name="delta"]').value);
            var reason = body.querySelector('[name="reason"]').value;
            if (!delta) return ui.toast("Informe uma quantidade diferente de zero.", "warning");
            try {
              var updated = await store.adjustStock(product.id, delta, reason);
              ui.closeModal();
              render();
              ui.toast("Estoque de " + updated.name + " agora: " + updated.stock + " un.", "success");
            } catch (err) {
              ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  /* ============================== CLIENTES ============================== */

  function customersView() {
    var search = String(aux.customersSearch || "").toLowerCase();
    var customers = store.listCustomers().filter(function (customer) {
      if (!search) return true;
      return (
        customer.name.toLowerCase().indexOf(search) > -1 ||
        String(customer.phone).indexOf(search) > -1 ||
        String(customer.email).toLowerCase().indexOf(search) > -1
      );
    });
    var sales = store.listSales().filter(function (s) { return s.status === "CONCLUIDA"; });

    var rows = customers.length
      ? customers.map(function (customer) {
          var own = sales.filter(function (s) { return s.customerId === customer.id; });
          var total = own.reduce(function (acc, s) { return acc + Number(s.total); }, 0);
          var debt = own.reduce(function (acc, s) { return acc + Number(s.balance); }, 0);
          return (
            "<tr>" +
              '<td><div class="row gap-8"><span class="avatar avatar-sm">' + ui.escapeHtml(ui.initials(customer.name)) + "</span>" +
                "<div><div class=\"bold\">" + ui.escapeHtml(customer.name) + "</div>" +
                '<div class="tiny faint">' + ui.escapeHtml(customer.phone ? ui.phoneMask(customer.phone) : customer.email || "sem contato") + "</div></div></div></td>" +
              '<td class="tiny">' + (customer.document ? ui.escapeHtml(core.maskCPF(customer.document)) : "—") + "</td>" +
              '<td class="tiny">' + ui.escapeHtml(core.formatDateBR(customer.birthDate) || "—") + "</td>" +
              '<td class="right mono">' + own.length + " compra(s)</td>" +
              '<td class="right mono bold">' + core.brl(total) + "</td>" +
              '<td class="right">' + (debt > 0 ? '<span class="badge badge-warning">' + core.brl(debt) + "</span>" : '<span class="badge badge-success">Em dia</span>') + "</td>" +
              '<td><div class="actions">' +
                '<button class="btn btn-ghost btn-icon" title="Editar" data-edit-customer="' + customer.id + '">' + Icons.icon("edit", 15) + "</button>" +
                '<button class="btn btn-ghost btn-icon" title="Excluir" data-del-customer="' + customer.id + '">' + Icons.icon("trash", 15) + "</button>" +
              "</div></td>" +
            "</tr>"
          );
        }).join("")
      : '<tr><td colspan="7">' + ui.emptyState(Icons.icon("customers", 22), "Nenhum cliente cadastrado", "Cadastre clientes para registrar fiado, aniversários e histórico.", '<button class="btn btn-primary btn-sm mt-8" data-new-customer>Cadastrar cliente</button>') + "</td></tr>";

    return (
      '<div class="stack">' +
        '<div class="card card-pad"><div class="row gap-8 wrap">' +
          '<div class="input-group grow" style="min-width:220px"><span class="icon-left">' + Icons.icon("search", 16) + "</span>" +
          '<input class="input" id="customers-search" placeholder="Buscar por nome, telefone ou e-mail..." value="' + ui.escapeHtml(aux.customersSearch || "") + '"></div>' +
          '<button class="btn btn-outline btn-sm" id="customers-export">' + Icons.icon("download", 14) + " CSV</button>" +
          '<button class="btn btn-primary btn-sm" data-new-customer>' + Icons.icon("plus", 14) + " Novo cliente</button>" +
        "</div></div>" +
        '<div class="card table-wrap"><table class="data"><thead><tr>' +
          "<th>Cliente</th><th>CPF</th><th>Nascimento</th><th class=\"right\">Compras</th><th class=\"right\">Total gasto</th><th class=\"right\">Fiado</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      "</div>"
    );
  }

  function openCustomerForm(id) {
    var customer = id ? store.getState().customers.find(function (c) { return c.id === id; }) : null;
    var body = ui.el("div", { class: "stack" });

    function fieldBlock(label, name, options) {
      var opts = options || {};
      return ui.el("div", { class: "field" }, [
        ui.el("label", { text: label }),
        ui.el("input", {
          class: "input", name: name, type: opts.type || "text",
          placeholder: opts.placeholder || "",
          value: opts.value === undefined || opts.value === null ? "" : String(opts.value)
        }),
        ui.el("span", { class: "field-error", "data-error": name })
      ]);
    }

    body.appendChild(ui.el("div", { class: "grid grid-2", style: "gap:12px" }, [
      fieldBlock("Nome completo *", "name", { value: customer ? customer.name : "", placeholder: "Maria Silva" }),
      fieldBlock("Telefone / WhatsApp", "phone", { value: customer ? ui.phoneMask(customer.phone) : "", placeholder: "(31) 99999-8888" })
    ]));
    body.appendChild(ui.el("div", { class: "grid grid-3", style: "gap:12px" }, [
      fieldBlock("CPF", "document", { value: customer ? customer.document : "", placeholder: "000.000.000-00" }),
      fieldBlock("Nascimento", "birthDate", { type: "date", value: customer ? customer.birthDate : "" }),
      fieldBlock("E-mail", "email", { type: "email", value: customer ? customer.email : "", placeholder: "cliente@email.com" })
    ]));
    body.appendChild(fieldBlock("Endereço", "address", { value: customer ? customer.address : "", placeholder: "Rua, número, bairro, cidade" }));
    var notes = ui.el("div", { class: "field" }, [ui.el("label", { text: "Observações" }), ui.el("textarea", { class: "textarea", name: "notes", placeholder: "Preferências de tamanho, cores, etc." })]);
    if (customer && customer.notes) notes.querySelector("textarea").value = customer.notes;
    body.appendChild(notes);

    ui.applyMask(body.querySelector('[name="phone"]'), ui.phoneMask);
    ui.applyMask(body.querySelector('[name="document"]'), ui.cpfMask);

    ui.openModal({
      title: customer ? "Editar cliente" : "Novo cliente",
      body: body,
      size: "wide",
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: customer ? "Salvar" : "Cadastrar",
          onclick: async function () {
            var values = {
              id: customer ? customer.id : undefined,
              name: body.querySelector('[name="name"]').value,
              phone: body.querySelector('[name="phone"]').value,
              document: body.querySelector('[name="document"]').value,
              birthDate: body.querySelector('[name="birthDate"]').value,
              email: body.querySelector('[name="email"]').value,
              address: body.querySelector('[name="address"]').value,
              notes: body.querySelector('[name="notes"]').value
            };
            if (!values.name || values.name.trim().length < 3) return ui.showFieldErrors({ name: "Informe o nome do cliente." }, body);
            try {
              await store.saveCustomer(values);
              ui.closeModal();
              render();
              ui.toast(customer ? "Cliente atualizado." : "Cliente cadastrado.", "success");
            } catch (err) {
              if (err.fields) ui.showFieldErrors(err.fields, body);
              else ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  /* ============================== FINANCEIRO ============================== */

  function financeView() {
    var sales = store.listSales().filter(function (s) { return s.status === "CONCLUIDA"; });
    var expenses = store.listExpenses();
    var summary = core.financialSummary({
      payments: sales.map(function (s) { return { method: s.paymentMethod, amount: s.paid }; }),
      expenses: expenses.filter(function (e) { return e.paid; }),
      costOfGoods: sales.reduce(function (acc, s) {
        return acc + (s.items || []).reduce(function (inner, item) { return inner + Number(item.cost) * Number(item.quantity); }, 0);
      }, 0)
    });
    var open = sales.filter(function (s) { return Number(s.balance) > 0; });
    var openTotal = open.reduce(function (acc, s) { return acc + Number(s.balance); }, 0);

    var expenseRows = expenses.length
      ? expenses.map(function (expense) {
          return (
            "<tr>" +
              "<td><div class=\"bold\">" + ui.escapeHtml(expense.description) + "</div>" +
              '<div class="tiny faint">' + ui.escapeHtml(expense.category) + " · venc. " + ui.escapeHtml(core.formatDateBR(expense.dueDate)) + "</div></td>" +
              '<td class="right mono bold">' + core.brl(expense.amount) + "</td>" +
              '<td class="right"><button class="badge ' + (expense.paid ? "badge-success" : "badge-warning") + '" data-toggle-expense="' + expense.id + '">' + (expense.paid ? "Pago" : "Em aberto") + "</button></td>" +
              '<td><div class="actions"><button class="btn btn-ghost btn-icon" data-del-expense="' + expense.id + '">' + Icons.icon("trash", 15) + "</button></div></td>" +
            "</tr>"
          );
        }).join("")
      : '<tr><td colspan="4">' + ui.emptyState(Icons.icon("finance", 22), "Nenhuma despesa lançada", "Lance aluguel, energia, fornecedores e outras saídas.", '<button class="btn btn-primary btn-sm mt-8" data-new-expense>Lançar despesa</button>') + "</td></tr>";

    var debtRows = open.length
      ? open.map(function (sale) {
          return (
            '<div class="row-between" style="padding:9px 0;border-bottom:1px solid var(--border)">' +
              '<div><div class="small bold">' + ui.escapeHtml(customerName(sale.customerId)) + "</div>" +
              '<div class="tiny faint">' + ui.escapeHtml(sale.code) + " · " + ui.escapeHtml(core.formatDateBR(sale.createdAt)) + "</div></div>" +
              '<div class="row gap-8"><span class="mono bold small" style="color:var(--warning)">' + core.brl(sale.balance) + "</span>" +
              '<button class="btn btn-outline btn-sm" data-receive="' + sale.id + '">Receber</button></div>' +
            "</div>"
          );
        }).join("")
      : '<p class="small muted">Nenhum saldo em aberto. Todos os clientes estão em dia.</p>';

    var methodRows = summary.byMethod.map(function (item) {
      return '<div class="row-between tiny" style="padding:4px 0"><span>' + ui.escapeHtml(PAYMENT_LABELS[item.method] || item.method) +
        '</span><span class="mono bold">' + core.brl(item.amount) + "</span></div>";
    }).join("") || '<p class="small muted">Sem recebimentos.</p>';

    return (
      '<div class="stack">' +
        '<div class="grid grid-4">' +
          kpi("Recebido", core.brl(summary.gross), "entradas confirmadas", "wallet", "success") +
          kpi("Custo das peças", core.brl(summary.costOfGoods), "CMV", "box", "info") +
          kpi("Despesas", core.brl(summary.expenses), "contas pagas", "trendDown", "danger") +
          kpi("Resultado", core.brl(summary.result), "margem " + summary.marginPercent + "%", "trendUp", summary.result >= 0 ? "success" : "danger") +
        "</div>" +
        '<div class="grid" style="grid-template-columns:1fr 1fr">' +
          '<div class="card"><div class="card-head"><span class="card-title">Recebimentos por forma</span></div>' +
            '<div class="card-body">' + methodRows + "</div></div>" +
          '<div class="card"><div class="card-head"><span class="card-title">Fiado em aberto</span>' +
            '<span class="badge ' + (openTotal > 0 ? "badge-warning" : "badge-success") + '">' + core.brl(openTotal) + "</span></div>" +
            '<div class="card-body">' + debtRows + "</div></div>" +
        "</div>" +
        '<div class="card"><div class="card-head"><span class="card-title">Despesas</span>' +
          '<button class="btn btn-primary btn-sm" data-new-expense>' + Icons.icon("plus", 14) + " Lançar despesa</button></div>" +
          '<div class="table-wrap"><table class="data"><thead><tr><th>Descrição</th><th class="right">Valor</th><th class="right">Status</th><th></th></tr></thead>' +
          "<tbody>" + expenseRows + "</tbody></table></div></div>" +
      "</div>"
    );
  }

  function openExpenseForm() {
    var body = ui.el("div", { class: "stack" });
    var categories = ["Aluguel", "Energia", "Água", "Internet", "Salários", "Fornecedores", "Marketing", "Impostos", "Outros"];
    body.appendChild(ui.el("div", { class: "grid grid-2", style: "gap:12px" }, [
      ui.el("div", { class: "field" }, [
        ui.el("label", { text: "Descrição *" }),
        ui.el("input", { class: "input", name: "description", placeholder: "Aluguel da loja — novembro" }),
        ui.el("span", { class: "field-error", "data-error": "description" })
      ]),
      ui.el("div", { class: "field" }, [
        ui.el("label", { text: "Valor (R$) *" }),
        ui.el("input", { class: "input", name: "amount", inputmode: "decimal", placeholder: "1.250,00" }),
        ui.el("span", { class: "field-error", "data-error": "amount" })
      ])
    ]));
    var select = ui.el("select", { class: "select", name: "category" });
    categories.forEach(function (category) {
      select.appendChild(ui.el("option", { value: category, text: category }));
    });
    body.appendChild(ui.el("div", { class: "grid grid-2", style: "gap:12px" }, [
      ui.el("div", { class: "field" }, [ui.el("label", { text: "Categoria" }), select]),
      ui.el("div", { class: "field" }, [ui.el("label", { text: "Vencimento" }), ui.el("input", { class: "input", name: "dueDate", type: "date", value: core.todayKey() })])
    ]));
    var paid = ui.el("label", { class: "check" }, [ui.el("input", { type: "checkbox", name: "paid" }), " Já está paga"]);
    paid.querySelector("input").checked = true;
    body.appendChild(paid);

    ui.openModal({
      title: "Lançar despesa",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: "Lançar",
          onclick: async function () {
            try {
              await store.saveExpense({
                description: body.querySelector('[name="description"]').value,
                amount: core.parseMoneyInput(body.querySelector('[name="amount"]').value),
                category: body.querySelector('[name="category"]').value,
                dueDate: body.querySelector('[name="dueDate"]').value,
                paid: body.querySelector('[name="paid"]').checked
              });
              ui.closeModal();
              render();
              ui.toast("Despesa lançada.", "success");
            } catch (err) {
              ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  /* ============================== RELATÓRIOS ============================== */

  function periodRange() {
    var preset = aux.reportPeriod || "30";
    if (preset === "all") return { from: null, to: null, label: "Todo o período" };
    var days = Number(preset);
    var to = new Date();
    var from = new Date();
    from.setDate(from.getDate() - days + 1);
    return { from: core.todayKey(from), to: core.todayKey(to), label: "Últimos " + days + " dias" };
  }

  function reportsView() {
    var range = periodRange();
    var data = store.dashboard({ from: range.from, to: range.to });
    var sales = store.listSales().filter(function (s) {
      return s.status === "CONCLUIDA" && core.withinPeriod(s.createdAt, range.from, range.to);
    });
    var methodTotals = core.groupSum(sales, function (s) { return s.paymentMethod; }, function (s) { return Number(s.paid); });
    var byDayRows = data.byDay.map(function (day) {
      return { label: core.formatDateBR(day.key).slice(0, 5), value: day.value };
    });

    var topRows = data.topProducts.length
      ? data.topProducts.map(function (item, index) {
          return (
            "<tr><td><span class=\"badge badge-accent\">" + (index + 1) + "</span></td>" +
            "<td>" + ui.escapeHtml(item.key) + "</td>" +
            '<td class="right mono bold">' + core.brl(item.value) + "</td></tr>"
          );
        }).join("")
      : '<tr><td colspan="3">' + ui.emptyState(Icons.icon("reports", 20), "Sem vendas no período", "Escolha outro intervalo ou registre vendas.") + "</td></tr>";

    return (
      '<div class="stack">' +
        '<div class="card card-pad row-between wrap">' +
          '<div class="segmented" id="report-period">' +
            ["7", "30", "90", "all"].map(function (key) {
              var label = key === "all" ? "Tudo" : key + " dias";
              return '<button data-period="' + key + '" aria-pressed="' + ((aux.reportPeriod || "30") === key) + '">' + label + "</button>";
            }).join("") +
          "</div>" +
          '<div class="row gap-8">' +
            '<button class="btn btn-outline btn-sm" id="report-print">' + Icons.icon("printer", 14) + " Imprimir</button>" +
            '<button class="btn btn-primary btn-sm" id="report-export">' + Icons.icon("download", 14) + " Exportar CSV</button>" +
          "</div>" +
        "</div>" +
        '<div class="grid grid-4">' +
          kpi("Faturamento", core.brl(data.revenue), range.label, "finance", "") +
          kpi("Lucro", core.brl(data.profit), "margem " + (data.revenue ? Math.round((data.profit / data.revenue) * 100) : 0) + "%", "trendUp", "success") +
          kpi("Vendas", String(data.salesCount), "ticket " + core.brl(data.ticket), "sales", "info") +
          kpi("A receber", core.brl(data.openDebt), "fiado em aberto", "wallet", "danger") +
        "</div>" +
        '<div class="grid" style="grid-template-columns:1.6fr 1fr">' +
          '<div class="card"><div class="card-head"><span class="card-title">Faturamento por dia</span></div>' +
            '<div class="card-body">' + ui.barsChart(byDayRows, { format: function (v) { return core.brl(v); } }) + "</div></div>" +
          '<div class="card"><div class="card-head"><span class="card-title">Formas de pagamento</span></div>' +
            '<div class="card-body">' + ui.donut(methodTotals.map(function (item) { return { label: PAYMENT_LABELS[item.key] || item.key, value: item.value }; })) + "</div></div>" +
        "</div>" +
        '<div class="grid" style="grid-template-columns:1fr 1fr">' +
          '<div class="card"><div class="card-head"><span class="card-title">Produtos mais vendidos</span></div>' +
            '<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Produto</th><th class="right">Faturamento</th></tr></thead><tbody>' + topRows + "</tbody></table></div></div>" +
          '<div class="card"><div class="card-head"><span class="card-title">Desempenho</span></div><div class="card-body stack">' +
            performanceRow("Ticket médio", core.brl(data.ticket)) +
            performanceRow("Custo das mercadorias", core.brl(data.cost)) +
            performanceRow("Despesas pagas", core.brl(data.expenses)) +
            performanceRow("Resultado líquido", core.brl(data.profit), data.profit >= 0 ? "var(--success)" : "var(--danger)") +
            performanceRow("Clientes cadastrados", String(data.customersCount)) +
          "</div></div>" +
        "</div>" +
      "</div>"
    );
  }

  function performanceRow(label, value, color) {
    return '<div class="row-between small"><span class="muted">' + ui.escapeHtml(label) + "</span>" +
      '<span class="bold mono"' + (color ? ' style="color:' + color + '"' : "") + ">" + ui.escapeHtml(value) + "</span></div>";
  }

  function bindReports() {
    ui.$$("[data-period]").forEach(function (button) {
      button.addEventListener("click", function () {
        aux.reportPeriod = button.dataset.period;
        document.getElementById("view").innerHTML = reportsView();
        bindReports();
      });
    });
    var print = document.getElementById("report-print");
    if (print) print.addEventListener("click", function () { window.print(); });
    var exportButton = document.getElementById("report-export");
    if (exportButton) exportButton.addEventListener("click", exportSalesCsv);
  }

  function exportSalesCsv() {
    var range = periodRange();
    var sales = store.listSales().filter(function (s) {
      return core.withinPeriod(s.createdAt, range.from, range.to);
    });
    var csv = core.toCsv(
      ["Código", "Data", "Cliente", "Itens", "Total", "Pago", "Saldo", "Pagamento", "Situação"],
      sales.map(function (s) {
        return [
          s.code,
          core.formatDateTimeBR(s.createdAt),
          customerName(s.customerId),
          s.items.map(function (i) { return i.quantity + "x " + i.name; }).join(" | "),
          core.brl(s.total),
          core.brl(s.paid),
          core.brl(s.balance),
          PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod,
          s.status
        ];
      })
    );
    ui.downloadFile("vendas-" + core.todayKey() + ".csv", csv, "text/csv;charset=utf-8");
    ui.toast("Planilha gerada com " + sales.length + " venda(s).", "success");
  }

  /* ============================== PERFIL ============================== */

  function profileView() {
    var user = session.user;
    var stats = statsFor(user);
    return (
      '<div class="stack">' +
        '<div class="profile-hero">' +
          '<div class="avatar-editor">' +
            '<div id="profile-avatar">' + ui.avatarHtml(user, "xl") + "</div>" +
            '<button class="avatar-edit-btn" id="avatar-pick" title="Trocar foto">' + Icons.icon("camera", 16) + "</button>" +
            '<input type="file" id="avatar-file" accept="image/*" style="display:none">' +
          "</div>" +
          '<div class="grow" style="min-width:200px">' +
            "<h2>" + ui.escapeHtml(user.name) + "</h2>" +
            '<p style="color:rgba(246,239,227,.7);font-size:13px">' + ui.escapeHtml(user.city || "Passarela da Moda") + "</p>" +
            '<div class="row gap-8 wrap mt-8">' +
              '<span class="badge" style="background:rgba(255,255,255,.12);color:#f4e4b8">Acesso administrativo</span>' +
              '<span class="badge" style="background:rgba(255,255,255,.12);color:#f6efe3">Desde ' + ui.escapeHtml(core.formatDateBR(user.createdAt)) + "</span>" +
              (user.city ? '<span class="badge" style="background:rgba(255,255,255,.12);color:#f6efe3">' + ui.escapeHtml(user.city) + "</span>" : "") +
            "</div>" +
            (user.bio ? '<p class="mt-16" style="font-size:12.5px;color:rgba(246,239,227,.8);max-width:460px">' + ui.escapeHtml(user.bio) + "</p>" : "") +
          "</div>" +
          '<div class="grid grid-3 gap-8" style="min-width:230px">' +
            heroStat(stats.sales, "vendas") + heroStat(stats.products, "produtos") + heroStat(stats.customers, "clientes") +
          "</div>" +
        "</div>" +

        '<div class="grid" style="grid-template-columns:1fr 1fr">' +
          '<div class="card"><div class="card-head"><span class="card-title">Dados pessoais</span></div>' +
            '<div class="card-body"><form class="stack" id="form-profile" novalidate>' +
              profileField("Nome de exibição", "name", user.name) +

              '<div class="grid grid-2" style="gap:12px">' +
                profileField("Telefone", "phone", user.phone ? ui.phoneMask(user.phone) : "", "tel") +
                profileField("CPF/CNPJ", "document", user.document ? (user.document.length > 11 ? core.maskCNPJ(user.document) : core.maskCPF(user.document)) : "", "text") +
              "</div>" +
              '<div class="grid grid-2" style="gap:12px">' +
                profileField("Nascimento", "birthDate", user.birthDate, "date") +
                profileField("Cidade", "city", user.city) +
              "</div>" +
              '<div class="field"><label>Bio</label><textarea class="textarea" name="bio" maxlength="280" placeholder="Conte um pouco sobre você...">' + ui.escapeHtml(user.bio || "") + "</textarea></div>" +
              '<div class="row-between"><button class="btn btn-primary" type="submit">Salvar alterações</button>' +
              '<button class="btn btn-ghost btn-sm" type="button" id="avatar-remove">Remover foto</button></div>' +
            "</form></div></div>" +

          '<div class="stack">' +
            '<div class="card"><div class="card-head"><span class="card-title">Arquivo de dados no computador</span></div>' +
              '<div class="card-body stack">' +
                '<p class="small muted">Escolha um arquivo no seu computador e o programa grava tudo nele sozinho: produtos, fotos, vendas, clientes e configurações.</p>' +
                '<div class="banner ' + (fileState.linked ? "banner-info" : "banner-warning") + '">' +
                  Icons.icon(fileState.linked ? "check" : "alert", 16) +
                  "<div>" + (fileState.linked
                    ? "Salvando em <strong>" + ui.escapeHtml(fileState.name) + "</strong>."
                    : fileState.supported
                      ? 'Nenhum arquivo vinculado ainda. Clique em <strong>Escolher arquivo</strong> para ativar o salvamento automático.'
                      : "Este navegador não permite gravar direto em arquivo. Use <strong>Baixar backup</strong> para guardar os dados manualmente.") +
                  "</div></div>" +
                '<div class="row gap-8 wrap">' +
                  (fileState.supported
                    ? fileState.linked
                      ? '<button class="btn btn-outline btn-sm" id="relink-file">' + Icons.icon("folder", 14) + " Trocar arquivo</button>"
                      : '<button class="btn btn-primary btn-sm" id="link-file">' + Icons.icon("folder", 14) + " Escolher arquivo</button>"
                    : "") +
                  '<button class="btn btn-primary btn-sm" id="save-now">' + Icons.icon("check", 14) + " Salvar agora</button>" +
                "</div>" +
                '<p class="tiny faint">Última gravação: ' + ui.escapeHtml(lastSavedLabel()) + "</p>" +
              "</div></div>" +

            '<div class="card"><div class="card-head"><span class="card-title">Backup dos seus dados</span></div>' +
              '<div class="card-body stack">' +
                '<p class="small muted">O backup é um arquivo .json com tudo (inclusive as fotos). Guarde numa pasta segura ou leve para outro computador.</p>' +
                '<div class="row gap-8 wrap">' +
                  '<button class="btn btn-primary btn-sm" id="export-backup">' + Icons.icon("download", 14) + " Baixar backup</button>" +
                  '<label class="btn btn-outline btn-sm" style="position:relative;overflow:hidden">' + Icons.icon("upload", 14) + " Restaurar" +
                    '<input type="file" id="import-backup" accept="application/json,.json" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>' +
                "</div>" +
                '<p class="tiny faint">Último acesso: ' + ui.escapeHtml(user.lastLoginAt ? core.relativeTime(user.lastLoginAt) : "agora") + "</p>" +
              "</div></div>" +
          "</div>" +
        "</div>" +
      "</div>"
    );
  }

  function heroStat(value, label) {
    return '<div style="background:rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;text-align:center">' +
      '<div style="font-size:18px;font-weight:700">' + value + "</div>" +
      '<div style="font-size:10px;color:rgba(246,239,227,.6);text-transform:uppercase;letter-spacing:.06em">' + label + "</div></div>";
  }

  function statsFor() {
    var state = store.getState();
    return {
      sales: state.sales.filter(function (s) { return s.status === "CONCLUIDA"; }).length,
      products: state.products.length,
      customers: state.customers.length
    };
  }

  function accountEmailField(email) {
    return '<div class="field"><label>E-mail da conta</label>' +
      '<input class="input" name="email" value="' + ui.escapeHtml(email || "") + '" type="email" autocomplete="email">' +
      '<span class="hint">É o e-mail usado para entrar. Trocar aqui muda seu login.</span>' +
      '<span class="field-error" data-error="email"></span></div>';
  }

  function profileField(label, name, value, type) {
    return (
      '<div class="field"><label>' + ui.escapeHtml(label) + "</label>" +
      '<input class="input" name="' + name + '" type="' + (type || "text") + '" value="' + ui.escapeHtml(value || "") + '">' +
      '<span class="field-error" data-error="' + name + '"></span></div>'
    );
  }

  function bindProfile() {
    var phoneInput = document.querySelector('#form-profile [name="phone"]');
    var documentInput = document.querySelector('#form-profile [name="document"]');
    if (phoneInput) ui.applyMask(phoneInput, ui.phoneMask);
    if (documentInput) ui.applyMask(documentInput, function (value) {
      return String(value).replace(/\D/g, "").length > 11 ? core.maskCNPJ(value) : ui.cpfMask(value);
    });

    var pick = document.getElementById("avatar-pick");
    var file = document.getElementById("avatar-file");
    if (pick && file) {
      pick.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", async function () {
        if (!file.files || !file.files[0]) return;
        try {
          var dataUrl = await ui.readImageFile(file.files[0], 512);
          await store.updateProfile({ avatar: dataUrl });
          session.user = store.getUser();
          document.getElementById("profile-avatar").innerHTML = ui.avatarHtml(session.user, "xl");
          render();
          ui.toast("Foto de perfil atualizada e salva.", "success");
        } catch (err) {
          ui.toast(err.message, "error", "Não foi possível usar esta imagem");
        }
      });
    }

    var remove = document.getElementById("avatar-remove");
    if (remove) remove.addEventListener("click", async function () {
      await store.updateProfile({ avatar: "" });
      render();
      ui.toast("Foto removida.", "info");
    });

    var form = document.getElementById("form-profile");
    if (form) form.addEventListener("submit", async function (event) {
      event.preventDefault();
      ui.clearErrors(form);
      try {
        await store.updateProfile({
          name: fieldValue(form, "name"),

          phone: fieldValue(form, "phone"),
          document: fieldValue(form, "document"),
          birthDate: fieldValue(form, "birthDate"),
          city: fieldValue(form, "city"),
          bio: fieldValue(form, "bio")
        });
        render();
        ui.toast("Perfil atualizado e salvo.", "success");
      } catch (err) {
        if (err.fields) ui.showFieldErrors(err.fields, form);
        else ui.toast(err.message, "error");
      }
    });

    var linkButton = document.getElementById("link-file");
    if (linkButton) linkButton.addEventListener("click", linkDataFile);

    var relinkButton = document.getElementById("relink-file");
    if (relinkButton) relinkButton.addEventListener("click", linkDataFile);

    var saveNow = document.getElementById("save-now");
    if (saveNow) saveNow.addEventListener("click", async function () {
      if (!fileState.linked) {
        var linked = await linkDataFile();
        if (!linked) return;
      }
      var ok = await dbLib.saveNow();
      ui.toast(ok ? "Dados gravados no arquivo." : "Não foi possível gravar agora.", ok ? "success" : "error");
      render();
    });

    var exportButton = document.getElementById("export-backup");
    if (exportButton) exportButton.addEventListener("click", async function () {
      var dump = await store.exportAll();
      ui.downloadFile("palco-backup-" + core.todayKey() + ".json", JSON.stringify(dump, null, 2), "application/json");
      ui.toast("Backup baixado. Guarde o arquivo em local seguro.", "success");
    });

    var importInput = document.getElementById("import-backup");
    if (importInput) importInput.addEventListener("change", function () {
      var chosen = importInput.files && importInput.files[0];
      if (!chosen) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          var payload = parsed && parsed.data ? parsed.data : parsed;
          if (!payload || !Array.isArray(payload.products)) throw new Error("Arquivo não parece ser um backup da Passarela da Moda.");
          ui.confirmDialog({
            title: "Restaurar backup?",
            message: "Isso substitui os dados atuais pelos dados do arquivo (" +
              payload.products.length + " produto(s), " + (payload.sales || []).length + " venda(s)).",
            confirmLabel: "Restaurar",
            danger: true
          }).then(async function (ok) {
            if (!ok) return;
            var totals = await store.restoreBackup(parsed);
            render();
            ui.toast("Backup restaurado: " + totals.products + " produto(s), " + totals.sales + " venda(s).", "success");
          });
        } catch (err) {
          ui.toast(err.message, "error", "Arquivo inválido");
        }
      };
      reader.readAsText(chosen);
    });
  }

  /* ============================== CONFIGURAÇÕES ============================== */

  function settingsView() {
    var settings = store.getState().settings || {};
    var accents = [
      { key: "gold", color: "#b08d3f", label: "Dourado" },
      { key: "rose", color: "#c07f86", label: "Rosé" },
      { key: "emerald", color: "#2f7a5f", label: "Esmeralda" },
      { key: "navy", color: "#2c4a7c", label: "Marinho" },
      { key: "indigo", color: "#4f4bb0", label: "Índigo" },
      { key: "graphite", color: "#4a4a52", label: "Grafite" }
    ];
    return (
      '<div class="stack">' +
        '<div class="grid" style="grid-template-columns:1.4fr 1fr">' +
          '<div class="card"><div class="card-head"><span class="card-title">Dados da loja</span></div>' +
            '<div class="card-body"><form class="stack" id="form-settings" novalidate>' +
              '<div class="grid grid-2" style="gap:12px">' +
                profileField("Nome da loja", "storeName", settings.storeName) +
                profileField("Assinatura (recibo)", "slogan", settings.slogan || "Moda & estilo") +
              "</div>" +
              '<div class="grid grid-3" style="gap:12px">' +
                profileField("CNPJ / CPF", "document", settings.document) +
                profileField("Telefone", "phone", settings.phone) +
                profileField("E-mail", "email", settings.email) +
              "</div>" +
              profileField("Endereço", "address", settings.address) +
              '<div class="row-between"><button class="btn btn-primary" type="submit">Salvar</button>' +
              '<span class="tiny faint">Aparece no painel e nos recibos</span></div>' +
            "</form></div></div>" +

          '<div class="stack">' +
            '<div class="card"><div class="card-head"><span class="card-title">Aparência</span></div>' +
              '<div class="card-body stack">' +
                '<div class="field"><label>Cor de destaque</label><div class="swatches" id="swatches">' +
                  accents.map(function (accent) {
                    return '<button class="swatch" data-accent="' + accent.key + '" title="' + accent.label + '" aria-pressed="' + (settings.accent === accent.key) + '" style="background:' + accent.color + '"></button>';
                  }).join("") +
                "</div></div>" +
                '<div class="field"><label>Tema</label><div class="segmented" id="theme-toggle">' +
                  '<button data-theme="light" aria-pressed="' + (settings.theme !== "dark") + '">' + Icons.icon("sun", 14) + " Claro</button>" +
                  '<button data-theme="dark" aria-pressed="' + (settings.theme === "dark") + '">' + Icons.icon("moon", 14) + " Escuro</button>" +
                "</div></div>" +
                '<div class="field"><label>Alerta de estoque baixo (unidades)</label>' +
                  '<input class="input" id="low-stock" type="number" min="0" value="' + Number(settings.lowStockThreshold || 3) + '">' +
                  '<span class="hint">Produtos com estoque igual ou abaixo deste número aparecem em alerta.</span></div>' +
              "</div></div>" +
            '<div class="card"><div class="card-head"><span class="card-title">Armazenamento</span></div>' +
              '<div class="card-body stack">' +
                '<div class="row-between small"><span class="muted">Tecnologia</span><span class="bold">' + ui.escapeHtml(storageLabel()) + "</span></div>" +
                '<div class="row-between small"><span class="muted">Arquivo de dados</span><span class="bold">' + (fileState.linked ? ui.escapeHtml(fileState.name) : "não vinculado") + "</span></div>" +
                '<div class="row-between small"><span class="muted">Tamanho dos dados</span><span class="bold">' + storageSize() + "</span></div>" +
                '<div class="banner banner-warning">' + Icons.icon("alert", 16) + "<div>Limpar os dados do navegador apaga o sistema. Faça backup em <strong>Meu perfil</strong> antes.</div></div>" +
              "</div></div>" +
          "</div>" +
        "</div>" +
        '<div class="card"><div class="card-head"><span class="card-title" style="color:var(--danger)">Zona de risco</span></div>' +
          '<div class="card-body row-between wrap gap-16">' +
            '<div><p class="small bold">Apagar todos os dados deste navegador</p>' +
            '<p class="tiny muted">Remove contas, produtos, vendas, clientes e configurações. Não há como desfazer.</p></div>' +
            '<button class="btn btn-danger btn-sm" id="wipe-data">' + Icons.icon("trash", 14) + " Apagar tudo</button>" +
          "</div></div>" +
      "</div>"
    );
  }

  function storageSize() {
    try {
      var total = 0;
      var keys = Object.keys(window.localStorage);
      keys.forEach(function (key) {
        if (key.indexOf("passarela:") === 0) total += key.length + (window.localStorage.getItem(key) || "").length;
      });
      if (total < 1024) return total + " B";
      if (total < 1024 * 1024) return (total / 1024).toFixed(1) + " KB";
      return (total / 1024 / 1024).toFixed(2) + " MB";
    } catch (err) {
      return "—";
    }
  }

  function bindSettings() {
    var form = document.getElementById("form-settings");
    if (form) form.addEventListener("submit", async function (event) {
      event.preventDefault();
      await store.saveSettings({
        storeName: fieldValue(form, "storeName").trim() || "Passarela da Moda",
        slogan: fieldValue(form, "slogan").trim() || "Moda & estilo",
        ownerName: fieldValue(form, "ownerName"),
        document: fieldValue(form, "document"),
        phone: fieldValue(form, "phone"),
        email: fieldValue(form, "email"),
        address: fieldValue(form, "address")
      });
      render();
      ui.toast("Configurações salvas.", "success");
    });

    ui.$$("[data-accent]").forEach(function (button) {
      if (!button.classList.contains("swatch")) return;
      button.addEventListener("click", async function () {
        await store.saveSettings({ accent: button.dataset.accent });
        render();
      });
    });

    ui.$$("#theme-toggle [data-theme]").forEach(function (button) {
      button.addEventListener("click", async function () {
        await store.saveSettings({ theme: button.dataset.theme });
        render();
      });
    });

    var lowStock = document.getElementById("low-stock");
    if (lowStock) lowStock.addEventListener("change", async function () {
      await store.saveSettings({ lowStockThreshold: Math.max(0, Number(lowStock.value) || 0) });
      ui.toast("Alerta de estoque atualizado.", "success");
    });

    var wipe = document.getElementById("wipe-data");
    if (wipe) wipe.addEventListener("click", async function () {
      var ok = await ui.confirmDialog({
        title: "Apagar todos os dados?",
        message: "Tudo será removido deste navegador — contas, produtos, vendas e clientes. Esta ação não pode ser desfeita.",
        confirmLabel: "Apagar definitivamente",
        danger: true
      });
      if (!ok) return;
      await store.wipeData();
      aux = {};
      render();
      ui.toast("Todos os dados foram apagados.", "info");
    });
  }

  /* ============================== CAIXA ============================== */

  function cashView() {
    var session = store.activeCashSession();
    var tab = aux.cashTab || "atual";
    var head =
      '<div class="page-head">' +
        '<div>' +
          "<h1>Caixa</h1>" +
          '<p class="muted">' + (session
            ? "Aberto em " + ui.escapeHtml(core.formatDateTimeBR(session.openedAt)) + " por " + ui.escapeHtml(session.openedBy)
            : "Nenhum caixa aberto no momento.") + "</p>" +
        "</div>" +
        '<div class="row gap-8 wrap">' +
          (session
            ? '<button class="btn btn-primary" data-cash="close">' + Icons.icon("lock", 15) + " Fechar caixa</button>" +
              '<button class="btn btn-outline" data-cash="sangria">' + Icons.icon("trendDown", 15) + " Sangria</button>" +
              '<button class="btn btn-outline" data-cash="suprimento">' + Icons.icon("trendUp", 15) + " Suprimento</button>"
            : '<button class="btn btn-primary" data-cash="open">' + Icons.icon("plus", 15) + " Abrir novo caixa</button>") +
        "</div>" +
      "</div>";

    var tabs =
      '<div class="segmented mb-16" id="cash-tabs">' +
        '<button data-cashtab="atual" aria-pressed="' + (tab === "atual") + '">Caixa atual</button>' +
        '<button data-cashtab="historico" aria-pressed="' + (tab === "historico") + '">Histórico</button>' +
        '<button data-cashtab="calendario" aria-pressed="' + (tab === "calendario") + '">Calendário</button>' +
      "</div>";

    if (tab === "historico") return head + tabs + cashHistoryView();
    if (tab === "calendario") return head + tabs + cashCalendarView();
    return head + tabs + cashCurrentView();
  }

  function cashCurrentView() {
    var session = store.activeCashSession();
    if (!session) {
      var last = store.listCashSessions()[0];
      return '<div class="card"><div class="empty" style="padding:48px 24px">' +
        Icons.icon("wallet", 30) +
        "<h3>Abrir um novo caixa</h3>" +
        '<p class="muted">Informe o dinheiro que já está na gaveta (fundo de troco) para começar o dia.</p>' +
        '<div class="row gap-8" style="justify-content:center;margin-top:16px">' +
          '<button class="btn btn-primary" data-cash="open">' + Icons.icon("plus", 15) + " Abrir caixa</button>" +
          (last ? '<button class="btn btn-outline" data-cashtab="historico">Ver caixa anterior</button>' : "") +
        "</div>" +
      "</div></div>";
    }

    var t = store.cashTotals(session);
    var sales = store.listSales().filter(function (s) {
      return s.cashSessionId === session.id;
    });
    var methods = Object.keys(t.byMethod).map(function (key) {
      return { key: key, value: t.byMethod[key] };
    }).filter(function (m) {
      return m.value > 0;
    });

    var kpis =
      '<div class="grid grid-4 gap-12 mb-16">' +
        kpi("Fundo de abertura", core.brl(t.opening), "dinheiro inicial", "wallet", "") +
        kpi("Vendido no caixa", core.brl(t.received), t.salesCount + " venda(s)", "sales", "info") +
        kpi("Dinheiro na gaveta", core.brl(t.cashInDrawer), "esperado ao fechar", "finance", "success") +
        kpi("A receber (fiado)", core.brl(t.debt), "saldo em aberto", "alert", t.debt > 0 ? "warning" : "") +
      "</div>";

    var chart = '<div class="card"><div class="card-head"><span class="card-title">Vendas deste caixa</span>' +
      '<span class="tiny faint">' + sales.length + " venda(s)</span></div>" +
      '<div class="card-body">' +
      (sales.length
        ? ui.areaChart(sales.slice().reverse().map(function (sale, index) {
            return { label: "V" + (index + 1), value: Number(sale.paid) - Number(sale.change) };
          }), { format: core.brl })
        : '<div class="empty" style="padding:26px"><p>Nenhuma venda neste caixa ainda.</p>' +
          '<button class="btn btn-primary btn-sm mt-8" data-nav="pos">Abrir PDV</button></div>') +
      "</div></div>";

    var side =
      '<div class="stack">' +
        '<div class="card"><div class="card-head"><span class="card-title">Por forma de pagamento</span></div>' +
          '<div class="card-body">' + (methods.length
            ? ui.donut(methods.map(function (m) { return { label: PAYMENT_LABELS[m.key] || m.key, value: m.value }; }))
            : '<p class="tiny faint">Ainda sem recebimentos.</p>') + "</div></div>" +

        '<div class="card"><div class="card-head"><span class="card-title">Movimentações</span></div>' +
          '<div class="card-body stack gap-8">' +
            (session.supplies || []).map(function (m) {
              return cashMovementRow(m, "suprimento");
            }).join("") +
            (session.withdrawals || []).map(function (m) {
              return cashMovementRow(m, "sangria");
            }).join("") +
            (!(session.supplies || []).length && !(session.withdrawals || []).length
              ? '<p class="tiny faint">Nenhuma sangria ou suprimento.</p>' : "") +
            '<div class="row-between small" style="border-top:1px dashed var(--border);padding-top:10px">' +
              "<span>Sangrias</span><span class=\"mono\" style=\"color:var(--danger)\">− " + core.brl(t.withdrawals) + "</span></div>" +
            '<div class="row-between small"><span>Suprimentos</span><span class="mono" style="color:var(--success)">+ ' + core.brl(t.supplies) + "</span></div>" +
          "</div></div>" +
      "</div>";

    return kpis + '<div class="grid" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px">' + chart + side + "</div>";
  }

  function cashMovementRow(movement, kind) {
    return '<div class="row-between small">' +
      "<span>" + (kind === "sangria" ? "−" : "+") + " " + ui.escapeHtml(movement.reason || (kind === "sangria" ? "Sangria" : "Suprimento")) +
      '<span class="tiny faint"> · ' + ui.escapeHtml(core.relativeTime(movement.at)) + "</span></span>" +
      '<span class="mono ' + (kind === "sangria" ? "" : "bold") + '" style="color:' + (kind === "sangria" ? "var(--danger)" : "var(--success)") + '">' +
      core.brl(movement.amount) + "</span></div>";
  }

  function cashHistoryView() {
    var sessions = store.listCashSessions();
    var fechados = sessions.filter(function (c) { return c.status === "FECHADO"; });
    var totalDiferenca = fechados.reduce(function (acc, c) {
      return acc + (Number(c.difference) || 0);
    }, 0);

    if (!sessions.length) {
      return '<div class="card"><div class="empty" style="padding:44px 24px">' + Icons.icon("sales", 28) +
        "<h3>Nenhum caixa registrado</h3><p class=\"muted\">Abra o primeiro caixa para começar a controlar.</p>" +
        '<button class="btn btn-primary mt-8" data-cash="open">Abrir caixa</button></div></div>';
    }

    var rows = sessions.map(function (c) {
      var totals = c.status === "FECHADO" && c.summary ? c.summary : store.cashTotals(c);
      var diff = Number(c.difference) || 0;
      return "<tr>" +
        '<td><strong>' + ui.escapeHtml(core.formatDateBR(c.openedAt)) + "</strong>" +
          '<div class="tiny faint">' + ui.escapeHtml(core.formatTimeBR(c.openedAt)) + " → " +
          (c.closedAt ? ui.escapeHtml(core.formatTimeBR(c.closedAt)) : "<span class=\"badge badge-warning\">aberto</span>") + "</div></td>" +
        '<td class="right mono">' + core.brl(c.openingAmount) + "</td>" +
        '<td class="right mono">' + core.brl(totals.received) + '<div class="tiny faint">' + (totals.salesCount || 0) + " venda(s)</div></td>" +
        '<td class="right mono">' + core.brl(c.expectedAmount !== undefined && c.expectedAmount !== null ? c.expectedAmount : store.cashTotals(c).expected) + "</td>" +
        '<td class="right mono">' + (c.countedAmount === null || c.countedAmount === undefined ? "—" : core.brl(c.countedAmount)) + "</td>" +
        '<td class="right mono" style="color:' + (diff === 0 ? "var(--text-soft)" : diff > 0 ? "var(--success)" : "var(--danger)") + '">' +
          (c.status === "FECHADO" ? (diff > 0 ? "+" : "") + core.brl(diff) : "—") + "</td>" +
        '<td class="right"><button class="btn btn-ghost btn-icon" data-cash-detail="' + c.id + '" title="Detalhes">' + Icons.icon("eye", 15) + "</button></td>" +
        "</tr>";
    }).join("");

    return '<div class="grid grid-3 gap-12 mb-16">' +
        kpi("Caixas fechados", String(fechados.length), "no histórico", "check", "success") +
        kpi("Diferença acumulada", core.brl(totalDiferenca), "contado − esperado", "alert", Math.abs(totalDiferenca) < 0.01 ? "success" : "warning") +
        kpi("Caixa aberto", store.activeCashSession() ? "sim" : "não", store.activeCashSession() ? "em operação" : "nenhum", "wallet", store.activeCashSession() ? "info" : "") +
      "</div>" +
      '<div class="card"><div class="card-head"><span class="card-title">Fechamentos anteriores</span>' +
        '<button class="btn btn-outline btn-sm" id="cash-print-history">' + Icons.icon("printer", 14) + " Imprimir</button></div>" +
        '<div class="table-wrap"><table class="data"><thead><tr>' +
          "<th>Dia</th><th class=\"right\">Abertura</th><th class=\"right\">Recebido</th>" +
          "<th class=\"right\">Esperado</th><th class=\"right\">Contado</th><th class=\"right\">Diferença</th><th></th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  function cashCalendarView() {
    var month = aux.cashMonth || new Date().toISOString().slice(0, 7);
    var day = aux.cashDay;
    var grid = ui.calendar(month, function (key) {
      return store.cashDaySummary(key);
    }, { selected: day, format: core.brl });

    var detail = "";
    if (day) {
      var summary = store.cashDaySummary(day);
      detail = '<div class="card mt-16"><div class="card-head">' +
        '<span class="card-title">' + ui.escapeHtml(core.formatDateBR(day)) + "</span>" +
        '<div class="row gap-8">' +
          kpiMini("Faturamento", core.brl(summary.revenue)) +
          kpiMini("Vendas", String(summary.salesCount)) +
          kpiMini("Recebido", core.brl(summary.received)) +
        "</div></div>" +
        '<div class="card-body stack gap-8">' +
        (summary.sessions.length
          ? summary.sessions.map(function (c) {
              var totals = c.status === "FECHADO" && c.summary ? c.summary : store.cashTotals(c);
              return '<div class="row-between" style="padding:10px 0;border-bottom:1px dashed var(--border)">' +
                "<div><strong>" + ui.escapeHtml(core.formatTimeBR(c.openedAt)) + "</strong>" +
                (c.closedAt ? " → " + ui.escapeHtml(core.formatTimeBR(c.closedAt)) : ' <span class="badge badge-warning">aberto</span>') +
                '<div class="tiny faint">abertura ' + core.brl(c.openingAmount) + " · " + (totals.salesCount || 0) + " venda(s)</div></div>" +
                '<div class="right"><div class="mono bold">' + core.brl(totals.received) + "</div>" +
                (c.countedAmount !== null && c.countedAmount !== undefined
                  ? '<div class="tiny ' + (Number(c.difference) === 0 ? "faint" : "") + '" style="color:' +
                    (Number(c.difference) === 0 ? "" : Number(c.difference) > 0 ? "var(--success)" : "var(--danger)") + '">diferença ' + core.brl(c.difference) + "</div>"
                  : "") +
                "</div></div>";
            }).join("")
          : '<p class="tiny faint">Nenhum caixa aberto neste dia.</p>') +
        "</div></div>";
    } else {
      detail = '<p class="tiny faint mt-16" style="text-align:center">Toque num dia para ver o caixa e as vendas daquele dia.</p>';
    }

    return '<div class="grid" style="grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:16px;align-items:start">' +
      '<div class="card"><div class="card-body">' + grid + "</div></div>" +
      "<div>" + detail + "</div></div>";
  }

  function kpiMini(label, value) {
    return '<div style="text-align:right"><div class="tiny faint">' + ui.escapeHtml(label) + "</div>" +
      '<div class="mono bold small">' + ui.escapeHtml(value) + "</div></div>";
  }

  function bindCash() {
    ui.$$("[data-cashtab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        aux.cashTab = btn.dataset.cashtab;
        render();
      });
    });

    ui.$$("[data-cash]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var action = btn.dataset.cash;
        if (action === "open") return openCashDialog();
        if (action === "close") return closeCashDialog();
        if (action === "sangria") return movementDialog("sangria");
        if (action === "suprimento") return movementDialog("suprimento");
      });
    });

    ui.$$("[data-cash-detail]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        return openCashDetail(btn.dataset.cashDetail);
      });
    });

    ui.$$("[data-cal]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var parts = (aux.cashMonth || new Date().toISOString().slice(0, 7)).split("-");
        var date = new Date(Number(parts[0]), Number(parts[1]) - 1 + (btn.dataset.cal === "next" ? 1 : -1), 1);
        aux.cashMonth = date.toISOString().slice(0, 7);
        aux.cashDay = null;
        render();
      });
    });

    ui.$$("[data-cal-day]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        aux.cashDay = btn.dataset.calDay;
        render();
      });
    });

    var printHistory = document.getElementById("cash-print-history");
    if (printHistory) printHistory.addEventListener("click", function () {
      printCashReport();
    });
  }

  function openCashDialog() {
    var body = ui.el("div", { class: "stack" });
    body.appendChild(ui.el("div", { class: "banner banner-info" }, [
      ui.el("div", { html: Icons.icon("info", 16) + "<div>O valor de abertura é o dinheiro que já está na gaveta para dar troco. Ele não é faturamento.</div>" })
    ]));
    var amount = field("Valor de abertura (R$)", "openingAmount", "input", { inputmode: "decimal", placeholder: "200,00", value: "" });
    var note = field("Observação (opcional)", "note", "input", { placeholder: "Turno da manhã, por exemplo" });
    body.appendChild(amount);
    body.appendChild(note);

    ui.openModal({
      title: "Abrir novo caixa",
      description: "Comece um turno e acompanhe tudo que entrar e sair da gaveta.",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: "Abrir caixa",
          onclick: async function () {
            var value = body.querySelector('[name="openingAmount"]').value;
            try {
              var session = await store.openCashSession({ openingAmount: value, note: body.querySelector('[name="note"]').value });
              ui.closeModal();
              ui.toast("Caixa aberto com " + core.brl(session.openingAmount) + " de fundo.", "success", "Bom trabalho!");
              render();
            } catch (err) {
              ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  function movementDialog(kind) {
    var sangria = kind === "sangria";
    var body = ui.el("div", { class: "stack" });
    body.appendChild(ui.el("p", { class: "small muted", text: sangria
      ? "Sangria é a retirada de dinheiro da gaveta (pagamento de fornecedor, depósito no banco...)."
      : "Suprimento é a entrada de dinheiro na gaveta (troco extra, por exemplo)." }));
    body.appendChild(field("Valor (R$)", "amount", "input", { inputmode: "decimal", placeholder: "100,00" }));
    body.appendChild(field("Motivo", "reason", "input", { placeholder: sangria ? "Depósito no banco" : "Troco extra" }));

    ui.openModal({
      title: sangria ? "Sangria de caixa" : "Suprimento de caixa",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn " + (sangria ? "btn-danger" : "btn-primary"), type: "button", text: sangria ? "Registrar sangria" : "Registrar suprimento",
          onclick: async function () {
            try {
              await store.cashMovement(kind, {
                amount: body.querySelector('[name="amount"]').value,
                reason: body.querySelector('[name="reason"]').value
              });
              ui.closeModal();
              ui.toast(sangria ? "Sangria registrada." : "Suprimento registrado.", "success");
              render();
            } catch (err) {
              ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  function closeCashDialog() {
    var session = store.activeCashSession();
    if (!session) return;
    var totals = store.cashTotals(session);

    var body = ui.el("div", { class: "stack" });
    body.appendChild(ui.el("div", { class: "cash-close-summary" }, [
      ui.el("div", { html:
        '<div class="row-between small"><span>Fundo de abertura</span><span class="mono">' + core.brl(totals.opening) + "</span></div>" +
        '<div class="row-between small"><span>Dinheiro recebido</span><span class="mono">' + core.brl(totals.byMethod.DINHEIRO || 0) + "</span></div>" +
        '<div class="row-between small"><span>Sangrias</span><span class="mono">− ' + core.brl(totals.withdrawals) + "</span></div>" +
        '<div class="row-between small"><span>Suprimentos</span><span class="mono">+ ' + core.brl(totals.supplies) + "</span></div>" +
        '<div class="row-between bold" style="border-top:1px dashed var(--border-strong);padding-top:8px;margin-top:6px"><span>Esperado na gaveta</span><span class="mono">' + core.brl(totals.expected) + "</span></div>"
      })
    ]));
    var counted = field("Dinheiro contado na gaveta (R$)", "countedAmount", "input", { inputmode: "decimal", placeholder: "0,00" });
    body.appendChild(counted);
    var diffBox = ui.el("div", { class: "alert alert-line", style: "display:none" });
    body.appendChild(diffBox);
    var note = field("Observação (opcional)", "note", "input", { placeholder: "Sobra de R$ 5,00 no caixa" });
    body.appendChild(note);

    var input = body.querySelector('[name="countedAmount"]');
    input.addEventListener("input", function () {
      var value = core.parseMoneyInput(input.value);
      var diff = core.round2(value - totals.expected);
      if (!input.value) {
        diffBox.style.display = "none";
        return;
      }
      diffBox.style.display = "";
      diffBox.className = "alert " + (Math.abs(diff) < 0.01 ? "alert-success" : diff > 0 ? "alert-info" : "alert-danger");
      diffBox.innerHTML = Math.abs(diff) < 0.01
        ? Icons.icon("check", 16) + "<div>Caixa batendo certinho. 🎉</div>"
        : Icons.icon("alert", 16) + "<div>" + (diff > 0 ? "Sobra de " : "Falta de ") + core.brl(Math.abs(diff)) +
          " em relação ao esperado (" + core.brl(totals.expected) + ").</div>";
    });

    ui.openModal({
      title: "Fechar caixa",
      description: "Conte o dinheiro da gaveta e confira a diferença antes de fechar.",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Cancelar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: "Fechar caixa",
          onclick: async function () {
            try {
              var closed = await store.closeCashSession({
                countedAmount: input.value,
                note: body.querySelector('[name="note"]').value
              });
              ui.closeModal();
              ui.toast("Caixa fechado. Diferença: " + core.brl(closed.difference), "success", "Fechamento concluído");
              render();
              openCashReceipt(closed.id);
            } catch (err) {
              ui.toast(err.message, "error");
            }
          }
        })
      ]
    });
  }

  function field(label, name, tag, attrs) {
    var input = ui.el(tag || "input", Object.assign({ class: "input", name: name }, attrs || {}));
    var wrap = ui.el("div", { class: "field" }, [ui.el("label", { text: label }), input]);
    wrap.input = input;
    return wrap;
  }

  function openCashDetail(id) {
    var session = store.listCashSessions().find(function (c) { return c.id === id; });
    if (!session) return;
    var totals = session.status === "FECHADO" && session.summary
      ? Object.assign({}, session.summary, { expected: session.expectedAmount })
      : store.cashTotals(session);

    var body = ui.el("div", { class: "stack" });
    body.innerHTML =
      '<div class="row-between small"><span>Abertura</span><span class="mono">' + core.brl(session.openingAmount) + "</span></div>" +
      '<div class="row-between small"><span>Vendas</span><span class="mono">' + (totals.salesCount || 0) + "</span></div>" +
      '<div class="row-between small"><span>Recebido</span><span class="mono">' + core.brl(totals.received) + "</span></div>" +
      Object.keys(totals.byMethod || {}).map(function (key) {
        return '<div class="row-between tiny faint"><span>' + ui.escapeHtml(PAYMENT_LABELS[key] || key) + '</span><span class="mono">' + core.brl(totals.byMethod[key]) + "</span></div>";
      }).join("") +
      '<div class="row-between small"><span>Sangrias</span><span class="mono">− ' + core.brl(totals.withdrawals || 0) + "</span></div>" +
      '<div class="row-between small"><span>Esperado</span><span class="mono">' + core.brl(totals.expected) + "</span></div>" +
      (session.countedAmount !== null && session.countedAmount !== undefined
        ? '<div class="row-between small"><span>Contado</span><span class="mono">' + core.brl(session.countedAmount) + "</span></div>" +
          '<div class="row-between bold"><span>Diferença</span><span class="mono">' + core.brl(session.difference) + "</span></div>"
        : "");

    ui.openModal({
      title: "Caixa de " + core.formatDateBR(session.openedAt),
      size: "small",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Fechar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", { class: "btn btn-primary", type: "button", text: "Ver comprovante", onclick: function () {
          ui.closeModal();
          openCashReceipt(session.id);
        } })
      ]
    });
  }

  /* ============================== RECIBO ============================== */

  function openReceipt(saleId) {
    var sale = store.getState().sales.find(function (s) { return s.id === saleId; });
    if (!sale) return;
    var body = ui.el("div", { class: "receipt-preview" });
    body.innerHTML = saleReceiptHtml(sale);
    ui.openModal({
      title: "Cupom " + sale.code,
      size: "small",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Fechar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", {
          class: "btn btn-primary", type: "button", text: "Imprimir cupom",
          onclick: function () { printThermal(saleReceiptHtml(sale), "Cupom " + sale.code); }
        })
      ]
    });
  }

  /* ---------------------- comprovantes para impressão ---------------------- */

  /** Logo em SVG (para o cupom). */
  var RECEIPT_LOGO =
    '<svg width="46" height="46" viewBox="16 0 208 208" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="34" y="16" width="172" height="172" rx="5" fill="none" stroke="#8d8779" stroke-width="6"/>' +
    '<path d="M66 46 L106 60 L106 172 L66 158 Z" fill="#c2a469"/>' +
    '<g fill="none" stroke="#26231f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M106 60 L106 172"/><path d="M106 72 L134 72 C158 72 158 118 134 118 L106 118"/>' +
    '<path d="M134 118 L134 172"/><path d="M150 172 L188 46"/></g></svg>';

  /**
   * Abre a janela de impressão com um cupom térmico (80 mm) bem acabado.
   * Recebe um HTML interno já formatado.
   */
  /** Monta o documento completo do cupom (usado na janela e no modo iframe). */
  function thermalDocument(innerHtml, title) {
    var css = thermalCss();
    return "<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'><title>" +
      ui.escapeHtml(title) + "</title><style>" + css + "</style></head><body><div class='sheet'>" +
      innerHtml + "</div></body></html>";
  }

  function printThermal(innerHtml, title) {
    var doc = thermalDocument(innerHtml, title);
    var win = null;
    try {
      win = window.open("", "_blank", "width=460,height=720");
    } catch (err) {
      win = null;
    }

    // Pop-up bloqueado → imprime por um iframe escondido (funciona igual).
    if (!win || !win.document) {
      var frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
      document.body.appendChild(frame);
      var fdoc = frame.contentWindow.document;
      fdoc.open();
      fdoc.write(doc);
      fdoc.close();
      setTimeout(function () {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch (err) {
          ui.toast("Não foi possível abrir a impressão neste navegador.", "error");
        }
        setTimeout(function () {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        }, 60000);
      }, 400);
      return;
    }

    win.document.write(doc);
    win.document.close();
    win.focus();
    setTimeout(function () { if (win.print) win.print(); }, 350);
  }

  function thermalCss() {
    return "@page{size:80mm auto;margin:4mm}" +
      "*{box-sizing:border-box}" +
      "body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.45;color:#111;margin:0;padding:0 2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      ".sheet{max-width:76mm;margin:0 auto}" +
      ".brand{text-align:center;padding:2mm 0 3mm}" +
      ".logo{display:block;margin:0 auto 1.5mm}" +
      ".brand-name{font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:#1b1a17}" +
      ".brand-sub{font-size:8.5px;letter-spacing:.28em;text-transform:uppercase;color:#9a8b62;margin-top:.5mm}" +
      ".brand-info{font-size:9px;color:#5d5950;margin-top:1.5mm;line-height:1.4}" +
      ".rule{border:0;border-top:1px dashed #b3ada1;margin:2.5mm 0}" +
      ".rule-strong{border-top:1.5px solid #1b1a17}" +
      ".doc-title{text-align:center;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:#6c665b;margin:1mm 0 1mm}" +
      ".meta{display:flex;justify-content:space-between;font-size:9.5px;color:#4a463f;gap:2mm}" +
      "table{width:100%;border-collapse:collapse}" +
      ".items th{font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#8a8377;text-align:left;padding-bottom:1mm;border-bottom:1px solid #d8d2c6}" +
      ".items td{font-size:10px;padding:1.4mm 0;border-bottom:1px dotted #ded8cc;vertical-align:top}" +
      ".items .name{font-weight:600}" +
      ".items .sku{font-size:8px;color:#938c80;letter-spacing:.03em}" +
      ".right{text-align:right}" +
      ".mono{font-variant-numeric:tabular-nums;font-feature-settings:'tnum'}" +
      ".totals{margin-top:2mm}" +
      ".totals .line{display:flex;justify-content:space-between;font-size:10px;padding:.6mm 0;color:#33302b}" +
      ".totals .line.muted{color:#7a7469}" +
      ".totals .grand{display:flex;justify-content:space-between;font-size:14px;font-weight:800;border-top:1.5px solid #1b1a17;margin-top:2mm;padding-top:2mm}" +
      ".pay{display:flex;justify-content:space-between;font-size:10px;padding:1mm 0}" +
      ".pay .tag{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:#8a8377;display:block}" +
      ".thx{text-align:center;font-size:9px;color:#5d5950;margin-top:3mm;line-height:1.5}" +
      ".thx strong{color:#1b1a17}" +
      ".stamp{display:inline-block;border:1.4px solid #b4472f;color:#b4472f;font-size:8px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:.8mm 2mm;border-radius:1mm;transform:rotate(-2deg)}" +
      ".kv{display:flex;justify-content:space-between;font-size:10px;padding:.5mm 0}" +
      ".kv .k{color:#7a7469}" +
      ".footer-note{text-align:center;font-size:8px;color:#a29c90;margin-top:2mm;letter-spacing:.04em}" +
      "@media screen{body{background:#f4f1ea;padding:6mm 0}.sheet{background:#fff;padding:6mm 4mm;box-shadow:0 10px 30px rgba(0,0,0,.12);border-radius:1mm}}" +
      "@media print{body{background:#fff}.sheet{box-shadow:none;padding:0}}";
  }

  function storeHeader(settings, docTitle) {
    return '<div class="brand">' +
      '<span class="logo">' + RECEIPT_LOGO + "</span>" +
      '<div class="brand-name">' + ui.escapeHtml(settings.storeName || "Passarela da Moda") + "</div>" +
      '<div class="brand-sub">' + ui.escapeHtml(settings.slogan || "Moda & estilo") + "</div>" +
      '<div class="brand-info">' +
        (settings.address ? ui.escapeHtml(settings.address) + "<br>" : "") +
        (settings.phone ? ui.escapeHtml(settings.phone) : "") +
        (settings.document ? (settings.phone ? " · " : "") + "CNPJ/CPF " + ui.escapeHtml(settings.document) : "") +
      "</div>" +
      "</div>" +
      '<div class="doc-title">' + ui.escapeHtml(docTitle) + "</div>";
  }

  /** Cupom de venda (80 mm). */
  function saleReceiptHtml(sale) {
    var settings = store.getState().settings || {};
    var customer = sale.customerId ? store.getState().customers.find(function (c) { return c.id === sale.customerId; }) : null;
    var cash = store.listCashSessions().find(function (c) { return c.id === sale.cashSessionId; });

    var items = sale.items.map(function (item) {
      return "<tr><td>" +
        '<div class="name">' + ui.escapeHtml(item.name) + "</div>" +
        '<div class="sku">' + ui.escapeHtml(item.sku || "") + " · " + item.quantity + " × " + core.brl(item.unitPrice) + "</div>" +
        '</td><td class="right mono">' + core.brl(item.quantity * item.unitPrice) + "</td></tr>";
    }).join("");

    return storeHeader(settings, "Cupom não fiscal") +
      '<hr class="rule">' +
      '<div class="meta"><span><strong>' + ui.escapeHtml(sale.code) + "</strong></span><span>" +
        ui.escapeHtml(core.formatDateTimeBR(sale.createdAt)) + "</span></div>" +
      '<div class="meta" style="margin-top:1mm"><span>Cliente: ' + ui.escapeHtml(customer ? customer.name : "Consumidor final") + "</span>" +
        (cash ? "<span>Caixa " + ui.escapeHtml(core.formatDateBR(cash.openedAt)) + "</span>" : "") + "</div>" +
      '<hr class="rule">' +
      '<table class="items"><thead><tr><th>Item</th><th class="right">Valor</th></tr></thead><tbody>' + items + "</tbody></table>" +
      '<div class="totals">' +
        '<div class="line muted"><span>Subtotal</span><span class="mono">' + core.brl(sale.subtotal) + "</span></div>" +
        (Number(sale.discount) > 0 ? '<div class="line muted"><span>Desconto</span><span class="mono">− ' + core.brl(sale.discount) + "</span></div>" : "") +
        '<div class="grand"><span>TOTAL</span><span class="mono">' + core.brl(sale.total) + "</span></div>" +
      "</div>" +
      '<div class="pay"><div><span class="tag">Pagamento</span>' + ui.escapeHtml(PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod) + "</div>" +
        '<div class="mono right"><span class="tag">Recebido</span>' + core.brl(sale.paid) + "</div></div>" +
      (Number(sale.change) > 0 ? '<div class="pay"><div></div><div class="mono right"><span class="tag">Troco</span>' + core.brl(sale.change) + "</div></div>" : "") +
      (Number(sale.balance) > 0 ? '<div class="pay"><div style="color:#b4472f"><span class="tag">Saldo em aberto</span>Fiado</div>' +
        '<div class="mono right" style="color:#b4472f">' + core.brl(sale.balance) + "</div></div>" : "") +
      '<hr class="rule">' +
      '<div class="kv"><span class="k">Atendente</span><span>' + ui.escapeHtml(sale.soldByName || "") + "</span></div>" +
      (sale.status === "CANCELADA" ? '<div style="text-align:center;margin:2mm 0"><span class="stamp">Cancelada</span></div>' : "") +
      '<div class="thx"><strong>Obrigado pela preferência!</strong><br>Trocas em até 7 dias com este cupom.</div>' +
      '<div class="footer-note">' + ui.escapeHtml(core.formatDateTimeBR(new Date().toISOString())) + "</div>";
  }

  /** Comprovante de fechamento de caixa (80 mm). */
  function cashReceiptHtml(session) {
    var settings = store.getState().settings || {};
    var summary = session.summary || {};
    var totals = session.summary ? session.summary : store.cashTotals(session);
    var expected = session.expectedAmount !== undefined && session.expectedAmount !== null ? session.expectedAmount : totals.expected;

    var methods = Object.keys(summary.byMethod || totals.byMethod || {}).map(function (key) {
      var value = (summary.byMethod || totals.byMethod)[key];
      return '<div class="kv"><span class="k">' + ui.escapeHtml(PAYMENT_LABELS[key] || key) + '</span><span class="mono">' + core.brl(value) + "</span></div>";
    }).join("");

    return storeHeader(settings, "Fechamento de caixa") +
      '<hr class="rule">' +
      '<div class="meta"><span><strong>' + ui.escapeHtml(core.formatDateBR(session.openedAt)) + "</strong></span>" +
        "<span>" + ui.escapeHtml(core.formatTimeBR(session.openedAt)) + " → " +
        (session.closedAt ? ui.escapeHtml(core.formatTimeBR(session.closedAt)) : "em aberto") + "</span></div>" +
      '<div class="kv"><span class="k">Operador</span><span>' + ui.escapeHtml(session.openedBy || "") + "</span></div>" +
      '<hr class="rule">' +
      '<div class="kv"><span class="k">Fundo de abertura</span><span class="mono">' + core.brl(session.openingAmount) + "</span></div>" +
      '<div class="kv"><span class="k">Vendas</span><span class="mono">' + (summary.salesCount || totals.salesCount || 0) + "</span></div>" +
      '<div class="kv"><span class="k">Recebido</span><span class="mono">' + core.brl(summary.received || totals.received || 0) + "</span></div>" +
      methods +
      '<hr class="rule">' +
      '<div class="kv"><span class="k">Sangrias</span><span class="mono">− ' + core.brl(summary.withdrawals || 0) + "</span></div>" +
      '<div class="kv"><span class="k">Suprimentos</span><span class="mono">+ ' + core.brl(summary.supplies || 0) + "</span></div>" +
      '<div class="kv"><span class="k">A receber (fiado)</span><span class="mono">' + core.brl(summary.debt || totals.debt || 0) + "</span></div>" +
      '<div class="totals"><div class="grand"><span>ESPERADO</span><span class="mono">' + core.brl(expected) + "</span></div></div>" +
      (session.countedAmount !== null && session.countedAmount !== undefined
        ? '<div class="kv" style="margin-top:2mm"><span class="k">Contado na gaveta</span><span class="mono">' + core.brl(session.countedAmount) + "</span></div>" +
          '<div class="kv"><span class="k">Diferença</span><span class="mono" style="font-weight:700">' + core.brl(session.difference) + "</span></div>"
        : "") +
      (session.closingNote ? '<hr class="rule"><div class="kv"><span class="k">Observação</span><span>' + ui.escapeHtml(session.closingNote) + "</span></div>" : "") +
      '<hr class="rule">' +
      '<div class="thx">Assinatura do responsável</div>' +
      '<div style="height:8mm;border-bottom:1px solid #b3ada1;margin:2mm 6mm 0"></div>' +
      '<div class="footer-note">' + ui.escapeHtml(core.formatDateTimeBR(new Date().toISOString())) + "</div>";
  }

  function openCashReceipt(sessionId) {
    var session = store.listCashSessions().find(function (c) { return c.id === sessionId; });
    if (!session) return;
    var body = ui.el("div", { class: "receipt-preview" });
    body.innerHTML = cashReceiptHtml(session);
    ui.openModal({
      title: "Comprovante de caixa",
      size: "small",
      body: body,
      footer: [
        ui.el("button", { class: "btn btn-outline", type: "button", text: "Fechar", onclick: function () { ui.closeModal(); } }),
        ui.el("button", { class: "btn btn-primary", type: "button", text: "Imprimir", onclick: function () {
          printThermal(cashReceiptHtml(session), "Fechamento de caixa");
        } })
      ]
    });
  }

  /** Relatório de caixas (impressão em A4). */
  function printCashReport() {
    var settings = store.getState().settings || {};
    var sessions = store.listCashSessions();
    var rows = sessions.map(function (c) {
      var totals = c.status === "FECHADO" && c.summary ? c.summary : store.cashTotals(c);
      var expected = c.expectedAmount !== undefined && c.expectedAmount !== null ? c.expectedAmount : store.cashTotals(c).expected;
      return "<tr><td>" + ui.escapeHtml(core.formatDateBR(c.openedAt)) +
        '<div class="tiny">' + ui.escapeHtml(core.formatTimeBR(c.openedAt)) + (c.closedAt ? " → " + ui.escapeHtml(core.formatTimeBR(c.closedAt)) : "") + "</div></td>" +
        '<td class="right">' + core.brl(c.openingAmount) + "</td>" +
        '<td class="right">' + (totals.salesCount || 0) + "</td>" +
        '<td class="right">' + core.brl(totals.received) + "</td>" +
        '<td class="right">' + core.brl(expected) + "</td>" +
        '<td class="right">' + (c.countedAmount === null || c.countedAmount === undefined ? "—" : core.brl(c.countedAmount)) + "</td>" +
        '<td class="right">' + (c.difference === null || c.difference === undefined ? "—" : core.brl(c.difference)) + "</td></tr>";
    }).join("");

    var win = window.open("", "_blank", "width=900,height=700");
    if (!win) return ui.toast("Permita pop-ups para imprimir.", "warning");
    win.document.write("<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'><title>Relatório de caixas</title><style>" +
      "@page{size:A4;margin:14mm}" +
      "body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#1b1a17}" +
      "header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1b1a17;padding-bottom:4mm;margin-bottom:5mm}" +
      "h1{font-family:Georgia,serif;font-size:17px;margin:0 0 1mm;letter-spacing:.04em}" +
      ".sub{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#9a8b62}" +
      "table{width:100%;border-collapse:collapse;margin-top:4mm}" +
      "th{font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;color:#7a7469;text-align:left;border-bottom:1px solid #ccc;padding:2mm 1mm}" +
      "td{padding:1.8mm 1mm;border-bottom:1px solid #eee;font-size:10.5px}" +
      ".right{text-align:right}.tiny{font-size:8.5px;color:#8a8377}" +
      "footer{margin-top:6mm;font-size:8.5px;color:#8a8377;text-align:center}" +
      "</style></head><body>" +
      "<header><div><h1>" + ui.escapeHtml(settings.storeName || "Passarela da Moda") + "</h1>" +
      '<div class="sub">Relatório de caixas</div></div><div class="tiny">Emitido em ' +
      ui.escapeHtml(core.formatDateTimeBR(new Date().toISOString())) + "</div></header>" +
      "<table><thead><tr><th>Dia</th><th class='right'>Abertura</th><th class='right'>Vendas</th>" +
      "<th class='right'>Recebido</th><th class='right'>Esperado</th><th class='right'>Contado</th><th class='right'>Diferença</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table>" +
      "<footer>Passarela da Moda · documento gerado pelo próprio sistema</footer></body></html>");
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 350);
  }

  /* ============================== LISTENERS GLOBAIS ============================== */

  function bindSimple() {
    // Busca genérica por view
    var map = {
      "sales-search": "salesSearch",
      "products-search": "productsSearch",
      "customers-search": "customersSearch"
    };
    Object.keys(map).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("input", ui.debounce(function () {
        aux[map[id]] = input.value;
        var position = input.selectionStart;
        document.getElementById("view").innerHTML = renderView();
        bindView();
        var next = document.getElementById(id);
        if (next) {
          next.focus();
          next.setSelectionRange(position, position);
        }
      }, 200));
    });

    var category = document.getElementById("products-category");
    if (category) category.addEventListener("change", function () {
      aux.productsCategory = category.value;
      document.getElementById("view").innerHTML = productsView();
      bindView();
    });

    var productsExport = document.getElementById("products-export");
    if (productsExport) productsExport.addEventListener("click", function () {
      var products = store.listProducts();
      var csv = core.toCsv(
        ["Nome", "SKU", "Categoria", "Cor", "Tamanho", "Preço", "Custo", "Estoque"],
        products.map(function (p) {
          return [p.name, p.sku, p.category, p.color, p.size, core.brl(p.price), core.brl(p.cost), p.stock];
        })
      );
      ui.downloadFile("produtos-" + core.todayKey() + ".csv", csv, "text/csv;charset=utf-8");
      ui.toast("Planilha com " + products.length + " produto(s).", "success");
    });

    var customersExport = document.getElementById("customers-export");
    if (customersExport) customersExport.addEventListener("click", function () {
      var customers = store.listCustomers();
      var csv = core.toCsv(
        ["Nome", "Telefone", "E-mail", "CPF", "Nascimento", "Endereço"],
        customers.map(function (c) {
          return [c.name, ui.phoneMask(c.phone), c.email, c.document, core.formatDateBR(c.birthDate), c.address];
        })
      );
      ui.downloadFile("clientes-" + core.todayKey() + ".csv", csv, "text/csv;charset=utf-8");
      ui.toast("Planilha com " + customers.length + " cliente(s).", "success");
    });
  }

  document.addEventListener("click", function (event) {
    var action = event.target.closest ? event.target.closest("[data-action]") : null;
    if (action && action.dataset.action === "link-file") {
      event.preventDefault();
      linkDataFile();
      return;
    }
    if (action && action.dataset.action === "file-panel") {
      event.preventDefault();
      navigate("settings");
      return;
    }
    if (action && action.dataset.action === "download-backup") {
      event.preventDefault();
      downloadBackup();
      return;
    }

    var newProduct = event.target.closest ? event.target.closest("[data-new-product]") : null;
    if (newProduct) openProductForm(null);

    var editProduct = event.target.closest ? event.target.closest("[data-edit-product]") : null;
    if (editProduct) openProductForm(editProduct.dataset.editProduct);

    var stock = event.target.closest ? event.target.closest("[data-stock]") : null;
    if (stock) openStockDialog(stock.dataset.stock);

    var delProduct = event.target.closest ? event.target.closest("[data-del-product]") : null;
    if (delProduct) {
      var product = store.getState().products.find(function (p) { return p.id === delProduct.dataset.delProduct; });
      ui.confirmDialog({
        title: "Excluir produto?",
        message: (product ? product.name : "Este produto") + " será removido do catálogo. Vendas já registradas não são afetadas.",
        confirmLabel: "Excluir",
        danger: true
      }).then(async function (ok) {
        if (!ok) return;
        await store.deleteProduct(delProduct.dataset.delProduct);
        render();
        ui.toast("Produto excluído.", "info");
      });
    }

    var newCustomer = event.target.closest ? event.target.closest("[data-new-customer]") : null;
    if (newCustomer) openCustomerForm(null);

    var editCustomer = event.target.closest ? event.target.closest("[data-edit-customer]") : null;
    if (editCustomer) openCustomerForm(editCustomer.dataset.editCustomer);

    var delCustomer = event.target.closest ? event.target.closest("[data-del-customer]") : null;
    if (delCustomer) {
      ui.confirmDialog({
        title: "Excluir cliente?",
        message: "O histórico de vendas é mantido, mas o cadastro será removido.",
        confirmLabel: "Excluir",
        danger: true
      }).then(async function (ok) {
        if (!ok) return;
        await store.deleteCustomer(delCustomer.dataset.delCustomer);
        render();
        ui.toast("Cliente excluído.", "info");
      });
    }

    var receipt = event.target.closest ? event.target.closest("[data-receipt]") : null;
    if (receipt) openReceipt(receipt.dataset.receipt);

    var cancel = event.target.closest ? event.target.closest("[data-cancel]") : null;
    if (cancel) {
      ui.promptDialog({
        title: "Cancelar venda",
        label: "Motivo do cancelamento",
        placeholder: "Cliente desistiu, erro no lançamento...",
        confirmLabel: "Cancelar venda"
      }).then(async function (reason) {
        if (reason === null) return;
        try {
          await store.cancelSale(cancel.dataset.cancel, reason);
          render();
          ui.toast("Venda cancelada e estoque devolvido.", "success");
        } catch (err) {
          ui.toast(err.message, "error");
        }
      });
    }

    var newExpense = event.target.closest ? event.target.closest("[data-new-expense]") : null;
    if (newExpense) openExpenseForm();

    var delExpense = event.target.closest ? event.target.closest("[data-del-expense]") : null;
    if (delExpense) {
      ui.confirmDialog({ title: "Remover despesa?", message: "O lançamento será excluído.", confirmLabel: "Remover", danger: true })
        .then(async function (ok) {
          if (!ok) return;
          await store.deleteExpense(delExpense.dataset.delExpense);
          render();
          ui.toast("Despesa removida.", "info");
        });
    }

    var toggleExpense = event.target.closest ? event.target.closest("[data-toggle-expense]") : null;
    if (toggleExpense) {
      store.toggleExpensePaid(toggleExpense.dataset.toggleExpense).then(function () {
        render();
      });
    }

    var receive = event.target.closest ? event.target.closest("[data-receive]") : null;
    if (receive) {
      var sale = store.getState().sales.find(function (s) { return s.id === receive.dataset.receive; });
      if (!sale) return;
      ui.confirmDialog({
        title: "Receber " + core.brl(sale.balance),
        message: "Confirmar quita o saldo em aberto da venda " + sale.code + ".",
        confirmLabel: "Confirmar recebimento"
      }).then(async function (ok) {
        if (!ok) return;
        try {
          await store.receiveDebt(sale.id);
          render();
          ui.toast("Saldo recebido. Venda quitada.", "success");
        } catch (err) {
          ui.toast(err.message, "error");
        }
      });
    }
  });

  /* Atalhos de teclado */
  document.addEventListener("keydown", function (event) {
    if (!session.user) return;
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (inField) return;
    if (event.key === "F2") {
      event.preventDefault();
      navigate("pos");
    }
    if (event.key === "F3") {
      event.preventDefault();
      navigate("products");
    }
    if (event.key === "F4") {
      event.preventDefault();
      navigate("sales");
    }
    if (event.key === "/" ) {
      var search = document.getElementById("pos-search") || document.getElementById("products-search");
      if (search) {
        event.preventDefault();
        search.focus();
      }
    }
  });

  window.App = {
    boot: boot,
    render: render,
    navigate: navigate,
    toast: function (message, type) { ui.toast(message, type || "info"); },
    store: function () { return store; }
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
