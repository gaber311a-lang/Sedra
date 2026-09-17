(() => {
  const STORAGE_KEY = "ops-dashboard-v1";
  const VIEW_TITLES = {
    overview: "نظرة عامة",
    "bot-core": "البوت والتشغيل",
    credentials: "التوكن والاتصال",
    tickets: "التذاكر",
    panel: "لوحة التذاكر",
    smart: "السلوك الذكي",
    messages: "رسائل البوت",
    permissions: "الصلاحيات",
    roles: "الرتب",
    audit: "سجل التدقيق",
    repo: "المستودع",
  };

  const DEFAULTS = {
    botRunning: true,
    smartMaster: true,
    credentials: {
      token: "",
      clientId: "",
      guildId: "",
      panelChannel: "",
      ticketCategory: "",
    },
    panel: {
      embedTitle: "مركز التذاكر",
      embedColor: "#7C3AED",
      embedDesc: "اختر التصنيف المناسب وافتح تذكرة — فريق الدعم يرد بأسرع وقت.",
      welcome: "مرحباً بك في مركز الدعم. صف طلبك بوضوح وسنساعدك فوراً.",
      categories: [
        { name: "دعم فني", key: "support", color: "#5B4DFF" },
        { name: "مبيعات", key: "sales", color: "#A855F7" },
        { name: "شكوى", key: "complaint", color: "#F59E0B" },
        { name: "عامة", key: "general", color: "#22C55E" },
      ],
    },
    smart: {
      autoreply: true,
      suggest: true,
      oneTicket: true,
      idleWarn: true,
      autoClose: true,
      sla: true,
      idleWarnMin: 30,
      idleCloseMin: 120,
      slaMin: 15,
      defaultPrio: "medium",
    },
    messages: {
      welcome: "أهلاً بك 👋 تم فتح تذكرتك. فريق الدعم سيراجع طلبك قريباً.",
      autoreply: "استلمنا رسالتك. يُرجى عدم فتح تذكرة أخرى وانتظار الرد.",
      claimed: "تم استلام التذكرة من قبل فريق الدعم. سنتواصل معك هنا.",
      idle: "تنبيه: التذكرة بدون نشاط. سيتم إغلاقها تلقائياً إن استمر الخمول.",
      close: "أُغلقت التذكرة تلقائياً بسبب الخمول. يمكنك فتح تذكرة جديدة عند الحاجة.",
      sla: "تنبيه SLA: تجاوزت التذكرة مهلة الرد الأولى المحددة.",
      exists: "لديك تذكرة مفتوحة بالفعل. أكمل المحادثة هناك بدلاً من فتح تذكرة جديدة.",
      thanks: "تم إغلاق التذكرة. شكراً لتواصلك معنا — نحن هنا دائماً.",
    },
    rolesExtra: { support: "", admin: "" },
    permissions: {},
    audit: [],
  };

  const PERM_ITEMS = [
    { id: "cmd_open", label: "/ticket فتح" },
    { id: "cmd_close", label: "/ticket إغلاق" },
    { id: "cmd_claim", label: "/ticket استلام" },
    { id: "cmd_add", label: "/ticket إضافة عضو" },
    { id: "btn_open", label: "زر فتح تذكرة" },
    { id: "btn_close", label: "زر إغلاق" },
    { id: "btn_claim", label: "زر استلام" },
    { id: "btn_transcript", label: "زر نسخة المحادثة" },
  ];

  const PERM_ROLES = ["everyone", "member", "support", "owner"];

  const MOCK_TICKETS = [
    { id: "TKT-0013", cat: "مبيعات", prio: "high", status: "open", assignee: "—", ago: "8 د" },
    { id: "TKT-0012", cat: "دعم فني", prio: "medium", status: "claimed", assignee: "نورة", ago: "12 د" },
    { id: "TKT-0011", cat: "شكوى", prio: "high", status: "claimed", assignee: "فهد", ago: "22 د" },
    { id: "TKT-0010", cat: "عامة", prio: "low", status: "open", assignee: "—", ago: "35 د" },
    { id: "TKT-0009", cat: "دعم فني", prio: "medium", status: "closed", assignee: "سارة", ago: "1 س" },
    { id: "TKT-0008", cat: "مبيعات", prio: "low", status: "closed", assignee: "فهد", ago: "2 س" },
    { id: "TKT-0007", cat: "دعم فني", prio: "high", status: "claimed", assignee: "نورة", ago: "3 س" },
    { id: "TKT-0006", cat: "عامة", prio: "medium", status: "open", assignee: "—", ago: "4 س" },
  ];

  const STATUS_AR = { open: "مفتوحة", claimed: "مُستَلَمة", closed: "مغلقة" };
  const PRIO_AR = { high: "عالية", medium: "متوسطة", low: "منخفضة" };

  let state = loadState();
  let ticketFilter = "all";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      return deepMerge(structuredClone(DEFAULTS), parsed);
    } catch {
      return structuredClone(DEFAULTS);
    }
  }

  function deepMerge(base, patch) {
    if (!patch || typeof patch !== "object") return base;
    for (const k of Object.keys(patch)) {
      if (patch[k] && typeof patch[k] === "object" && !Array.isArray(patch[k])) {
        base[k] = deepMerge(base[k] || {}, patch[k]);
      } else {
        base[k] = patch[k];
      }
    }
    return base;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(msg) {
    const el = $("#toast-global");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function addAudit(type, text) {
    const entry = {
      type,
      text,
      at: new Date().toISOString(),
    };
    state.audit.unshift(entry);
    state.audit = state.audit.slice(0, 80);
    saveState();
    renderAudit();
  }

  function maskSecret(v) {
    if (!v) return "";
    if (v.length <= 8) return "•".repeat(v.length);
    return v.slice(0, 4) + "•".repeat(Math.min(20, v.length - 8)) + v.slice(-4);
  }

  /* Auth */
  const gate = $("#login-gate");
  const app = $("#app");
  if (sessionStorage.getItem("ops-authed") === "1") {
    gate.hidden = true;
    app.hidden = false;
  }

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pin = $("#login-pin").value.trim();
    const err = $("#login-error");
    if (pin.length < 4) {
      err.hidden = false;
      return;
    }
    err.hidden = true;
    sessionStorage.setItem("ops-authed", "1");
    gate.hidden = true;
    app.hidden = false;
    addAudit("power", "تسجيل دخول إلى لوحة Ops (تجريبي)");
    toast("مرحباً بك في Ops");
  });

  $("#logout-btn").addEventListener("click", () => {
    sessionStorage.removeItem("ops-authed");
    app.hidden = true;
    gate.hidden = false;
    $("#login-pin").value = "";
    closeSidebar();
  });

  /* Navigation */
  function showView(name) {
    $$(".view").forEach((v) => {
      const on = v.id === `view-${name}`;
      v.hidden = !on;
      v.classList.toggle("is-active", on);
    });
    $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
    $("#view-title").textContent = VIEW_TITLES[name] || name;
    closeSidebar();
    if (name === "tickets") renderTickets();
    if (name === "audit") renderAudit();
  }

  $$(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  $$("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.goto));
  });

  const sidebar = $("#sidebar");
  const backdrop = $("#sidebar-backdrop");
  const toggle = $("#sidebar-toggle");

  function openSidebar() {
    sidebar.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    backdrop.hidden = false;
  }
  function closeSidebar() {
    sidebar.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    backdrop.hidden = true;
  }
  toggle.addEventListener("click", () => {
    sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener("click", closeSidebar);

  /* Bot power */
  function syncBotUI() {
    const on = state.botRunning;
    const pill = $("#bot-status-pill");
    const power = $("#power-pill");
    const overview = $("#overview-bot-pill");
    const label = on ? "البوت يعمل" : "البوت متوقف";
    const cls = on ? "online" : "offline";
    [pill, power, overview].forEach((el) => {
      if (!el) return;
      el.className = `status-pill ${cls}` + (el.classList.contains("sm") || el.id === "overview-bot-pill" ? (el.id === "overview-bot-pill" || el.classList.contains("sm") ? " sm" : "") : "");
      if (el.id === "overview-bot-pill" || el.classList.contains("sm")) {
        el.className = `status-pill ${cls} sm`;
      } else {
        el.className = `status-pill ${cls}`;
      }
      el.innerHTML = `<span class="pulse"></span> ${el.id === "overview-bot-pill" ? (on ? "Online" : "Offline") : label}`;
    });
    $("#conn-state").textContent = on ? "Gateway متصل" : "غير متصل";
    $("#last-heartbeat").textContent = on ? "الآن" : "—";
    $("#overview-mode").textContent = state.smartMaster
      ? "ذكي · رد تلقائي مفعّل"
      : "وضع أساسي · الذكاء متوقف";
    $("#smart-master").checked = state.smartMaster;
    $("#btn-start").disabled = on;
    $("#btn-stop").disabled = !on;
  }

  $("#btn-start").addEventListener("click", () => {
    state.botRunning = true;
    saveState();
    syncBotUI();
    addAudit("power", "تشغيل البوت الذكي");
    toast("تم تشغيل البوت (تجريبي)");
  });
  $("#btn-stop").addEventListener("click", () => {
    state.botRunning = false;
    saveState();
    syncBotUI();
    addAudit("power", "إيقاف البوت");
    toast("تم إيقاف البوت (تجريبي)");
  });
  $("#btn-restart").addEventListener("click", () => {
    state.botRunning = true;
    saveState();
    syncBotUI();
    addAudit("power", "إعادة تشغيل البوت");
    toast("تمت إعادة التشغيل (تجريبي)");
  });
  $("#smart-master").addEventListener("change", (e) => {
    state.smartMaster = e.target.checked;
    saveState();
    syncBotUI();
    addAudit("settings", state.smartMaster ? "تفعيل الوضع الذكي" : "إيقاف الوضع الذكي");
  });

  /* Credentials */
  function fillCredentials() {
    const c = state.credentials;
    $("#cfg-token").value = c.token || "";
    $("#cfg-client").value = c.clientId || "";
    $("#cfg-guild").value = c.guildId || "";
    $("#cfg-panel-ch").value = c.panelChannel || "";
    $("#cfg-ticket-cat").value = c.ticketCategory || "";
    $("#overview-guild").textContent = c.guildId ? maskSecret(c.guildId) : "غير مُعد";
  }

  $$(".reveal-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "إخفاء" : "إظهار";
    });
  });

  $("#form-credentials").addEventListener("submit", (e) => {
    e.preventDefault();
    state.credentials = {
      token: $("#cfg-token").value.trim(),
      clientId: $("#cfg-client").value.trim(),
      guildId: $("#cfg-guild").value.trim(),
      panelChannel: $("#cfg-panel-ch").value.trim(),
      ticketCategory: $("#cfg-ticket-cat").value.trim(),
    };
    saveState();
    fillCredentials();
    addAudit("settings", "حفظ بيانات الاتصال (محلي)");
    toast("حُفظ الاتصال محلياً");
  });

  /* Panel + categories */
  function fillPanel() {
    const p = state.panel;
    $("#cfg-embed-title").value = p.embedTitle;
    $("#cfg-embed-color").value = p.embedColor;
    $("#cfg-embed-hex").value = p.embedColor;
    $("#cfg-embed-desc").value = p.embedDesc;
    $("#cfg-welcome").value = p.welcome;
    updateEmbedPreview(p.embedColor);
    renderCatEditor();
  }

  function updateEmbedPreview(color) {
    const el = $("#embed-preview");
    el.style.background = `linear-gradient(135deg, #5B4DFF, ${color}, #A855F7)`;
  }

  $("#cfg-embed-color").addEventListener("input", (e) => {
    $("#cfg-embed-hex").value = e.target.value;
    updateEmbedPreview(e.target.value);
  });
  $("#cfg-embed-hex").addEventListener("change", (e) => {
    let v = e.target.value.trim();
    if (!/^#/.test(v)) v = "#" + v;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      $("#cfg-embed-color").value = v;
      updateEmbedPreview(v);
    }
  });

  function renderCatEditor() {
    const list = $("#cat-edit-list");
    list.innerHTML = "";
    state.panel.categories.forEach((cat, i) => {
      const li = document.createElement("li");
      li.className = "cat-edit-row";
      li.innerHTML = `
        <input type="color" value="${cat.color}" data-i="${i}" data-f="color" aria-label="لون التصنيف" />
        <input type="text" value="${escapeAttr(cat.name)}" data-i="${i}" data-f="name" placeholder="الاسم بالعربي" />
        <input type="text" class="en" dir="ltr" value="${escapeAttr(cat.key)}" data-i="${i}" data-f="key" placeholder="key" />
        <button type="button" class="btn btn-ghost btn-sm cat-actions" data-del="${i}">حذف</button>
      `;
      list.appendChild(li);
    });
    list.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        const i = +inp.dataset.i;
        const f = inp.dataset.f;
        state.panel.categories[i][f] = inp.value;
      });
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.panel.categories.splice(+btn.dataset.del, 1);
        renderCatEditor();
      });
    });
  }

  $("#btn-add-cat").addEventListener("click", () => {
    state.panel.categories.push({ name: "تصنيف جديد", key: "new", color: "#A855F7" });
    renderCatEditor();
  });

  $("#form-panel").addEventListener("submit", (e) => {
    e.preventDefault();
    state.panel.embedTitle = $("#cfg-embed-title").value.trim();
    state.panel.embedColor = $("#cfg-embed-hex").value.trim() || "#7C3AED";
    state.panel.embedDesc = $("#cfg-embed-desc").value.trim();
    state.panel.welcome = $("#cfg-welcome").value.trim();
    saveState();
    addAudit("settings", "تحديث لوحة التذاكر والتصنيفات");
    toast("حُفظت لوحة التذاكر");
  });

  /* Smart */
  function fillSmart() {
    const s = state.smart;
    $("#smart-autoreply").checked = s.autoreply;
    $("#smart-suggest").checked = s.suggest;
    $("#smart-one").checked = s.oneTicket;
    $("#smart-idle").checked = s.idleWarn;
    $("#smart-autoclose").checked = s.autoClose;
    $("#smart-sla").checked = s.sla;
    $("#cfg-idle-warn").value = s.idleWarnMin;
    $("#cfg-idle-close").value = s.idleCloseMin;
    $("#cfg-sla").value = s.slaMin;
    $("#cfg-default-prio").value = s.defaultPrio;
  }

  $("#form-smart").addEventListener("submit", (e) => {
    e.preventDefault();
    state.smart = {
      autoreply: $("#smart-autoreply").checked,
      suggest: $("#smart-suggest").checked,
      oneTicket: $("#smart-one").checked,
      idleWarn: $("#smart-idle").checked,
      autoClose: $("#smart-autoclose").checked,
      sla: $("#smart-sla").checked,
      idleWarnMin: +$("#cfg-idle-warn").value || 30,
      idleCloseMin: +$("#cfg-idle-close").value || 120,
      slaMin: +$("#cfg-sla").value || 15,
      defaultPrio: $("#cfg-default-prio").value,
    };
    saveState();
    syncBotUI();
    addAudit("settings", "تحديث إعدادات السلوك الذكي");
    toast("حُفظ السلوك الذكي");
  });

  /* Messages */
  function fillMessages() {
    const m = state.messages;
    $("#msg-welcome").value = m.welcome;
    $("#msg-autoreply").value = m.autoreply;
    $("#msg-claimed").value = m.claimed;
    $("#msg-idle").value = m.idle;
    $("#msg-close").value = m.close;
    $("#msg-sla").value = m.sla;
    $("#msg-exists").value = m.exists;
    $("#msg-thanks").value = m.thanks;
  }

  $("#form-messages").addEventListener("submit", (e) => {
    e.preventDefault();
    state.messages = {
      welcome: $("#msg-welcome").value,
      autoreply: $("#msg-autoreply").value,
      claimed: $("#msg-claimed").value,
      idle: $("#msg-idle").value,
      close: $("#msg-close").value,
      sla: $("#msg-sla").value,
      exists: $("#msg-exists").value,
      thanks: $("#msg-thanks").value,
    };
    saveState();
    addAudit("settings", "تحديث رسائل البوت العربية");
    toast("حُفظت الرسائل");
  });

  /* Permissions */
  function ensurePerms() {
    if (!state.permissions || !Object.keys(state.permissions).length) {
      state.permissions = {};
      PERM_ITEMS.forEach((item) => {
        state.permissions[item.id] = {
          everyone: item.id === "btn_open" || item.id === "cmd_open",
          member: item.id.startsWith("btn_") || item.id === "cmd_open",
          support: true,
          owner: true,
        };
      });
    }
  }

  function renderPerms() {
    ensurePerms();
    const body = $("#perm-body");
    body.innerHTML = "";
    PERM_ITEMS.forEach((item) => {
      const row = state.permissions[item.id] || {};
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${item.label}</td>` + PERM_ROLES.map((r) =>
        `<td><input type="checkbox" data-perm="${item.id}" data-role="${r}" ${row[r] ? "checked" : ""} /></td>`
      ).join("");
      body.appendChild(tr);
    });
  }

  $("#form-perms").addEventListener("submit", (e) => {
    e.preventDefault();
    $$("#perm-body input[type=checkbox]").forEach((cb) => {
      if (!state.permissions[cb.dataset.perm]) state.permissions[cb.dataset.perm] = {};
      state.permissions[cb.dataset.perm][cb.dataset.role] = cb.checked;
    });
    saveState();
    addAudit("settings", "تحديث صلاحيات الأوامر والأزرار");
    toast("حُفظت الصلاحيات");
  });

  /* Roles extra */
  function fillRoles() {
    $("#cfg-role-support").value = state.rolesExtra.support || "";
    $("#cfg-role-admin").value = state.rolesExtra.admin || "";
  }

  $("#btn-save-roles").addEventListener("click", () => {
    state.rolesExtra = {
      support: $("#cfg-role-support").value.trim(),
      admin: $("#cfg-role-admin").value.trim(),
    };
    saveState();
    addAudit("settings", "حفظ رتب إضافية");
    toast("حُفظت الرتب الإضافية");
  });

  $$(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast("تم النسخ");
      } catch {
        toast("تعذّر النسخ — انسخ يدوياً");
      }
    });
  });

  /* Tickets */
  function renderTickets() {
    const q = ($("#ticket-search").value || "").trim().toLowerCase();
    const rows = MOCK_TICKETS.filter((t) => {
      if (ticketFilter !== "all" && t.status !== ticketFilter) return false;
      if (!q) return true;
      return t.id.toLowerCase().includes(q) || t.cat.includes(q);
    });
    const tbody = $("#tickets-body");
    const cards = $("#tickets-cards");
    tbody.innerHTML = rows.map((t) => `
      <tr>
        <td><span class="ticket-id en" dir="ltr">${t.id}</span></td>
        <td>${t.cat}</td>
        <td><span class="prio ${t.prio}">${PRIO_AR[t.prio]}</span></td>
        <td><span class="claim-chip ${t.status}">${STATUS_AR[t.status]}</span></td>
        <td>${t.assignee}</td>
        <td>${t.ago}</td>
      </tr>
    `).join("");
    cards.innerHTML = rows.map((t) => `
      <article class="ticket-card">
        <div class="ticket-card-top">
          <strong class="ticket-id en" dir="ltr">${t.id}</strong>
          <span class="claim-chip ${t.status}">${STATUS_AR[t.status]}</span>
        </div>
        <div class="ticket-card-meta">
          <span>${t.cat}</span>
          <span class="prio ${t.prio}">${PRIO_AR[t.prio]}</span>
        </div>
        <div class="ticket-card-foot"><span>${t.assignee}</span><span>${t.ago}</span></div>
      </article>
    `).join("");
  }

  $$(".filters .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$(".filters .chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      ticketFilter = chip.dataset.filter;
      renderTickets();
    });
  });
  $("#ticket-search").addEventListener("input", renderTickets);

  /* Overview activity + audit */
  function renderOverviewActivity() {
    const items = (state.audit.length ? state.audit : [
      { type: "ticket", text: "تم استلام TKT-0012 — دعم فني", at: new Date(Date.now() - 120000).toISOString() },
      { type: "ticket", text: "تذكرة جديدة TKT-0013 — مبيعات", at: new Date(Date.now() - 480000).toISOString() },
      { type: "ticket", text: "أُغلقت TKT-0009", at: new Date(Date.now() - 900000).toISOString() },
      { type: "warn", text: "تحذير خمول على TKT-0010", at: new Date(Date.now() - 1320000).toISOString() },
    ]).slice(0, 6);
    $("#overview-activity").innerHTML = items.map((a) => `
      <li>
        <span class="dot ${a.type === "warn" ? "open" : a.type === "power" ? "claim" : "open"}"></span>
        <span>${escapeHtml(a.text)}</span>
        <time>${relTime(a.at)}</time>
      </li>
    `).join("");
  }

  function renderAudit() {
    const list = $("#audit-list");
    const items = state.audit.length ? state.audit : [
      { type: "power", text: "تشغيل البوت عند الإقلاع", at: new Date(Date.now() - 3600000).toISOString() },
      { type: "ticket", text: "فتح TKT-0013 بواسطة عضو", at: new Date(Date.now() - 480000).toISOString() },
      { type: "settings", text: "تحميل إعدادات افتراضية", at: new Date(Date.now() - 7200000).toISOString() },
    ];
    list.innerHTML = items.map((a) => `
      <li class="audit-item">
        <span class="audit-badge ${a.type}">${a.type}</span>
        <span>${escapeHtml(a.text)}</span>
        <time datetime="${a.at}">${fmtTime(a.at)}</time>
      </li>
    `).join("");
  }

  $("#btn-refresh-audit").addEventListener("click", () => {
    addAudit("settings", "تحديث سجل التدقيق يدوياً");
    toast("تم التحديث");
  });

  /* Live-ish mock stats tick */
  function tickStats() {
    const jitter = (n, d = 1) => Math.max(0, n + Math.round((Math.random() - 0.5) * d));
    $("#stat-open").textContent = jitter(12, 2);
    $("#stat-claimed").textContent = jitter(7, 2);
    $("#stat-closed").textContent = jitter(23, 3);
    $("#stat-auto").textContent = jitter(41, 4);
    $("#stat-suggest").textContent = jitter(29, 3);
    const sla = 92 + Math.floor(Math.random() * 5);
    $("#stat-sla").innerHTML = `${sla}<span class="unit">%</span>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/`/g, "&#96;");
  }
  function relTime(iso) {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "الآن";
    if (m < 60) return `منذ ${m} د`;
    const h = Math.round(m / 60);
    return `منذ ${h} س`;
  }
  function fmtTime(iso) {
    try {
      return new Date(iso).toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
    } catch {
      return iso;
    }
  }

  /* Init */
  fillCredentials();
  fillPanel();
  fillSmart();
  fillMessages();
  fillRoles();
  renderPerms();
  renderTickets();
  renderAudit();
  renderOverviewActivity();
  syncBotUI();
  tickStats();
  setInterval(tickStats, 12000);
  setInterval(renderOverviewActivity, 30000);

  if (!state.audit.length) {
    state.audit = [
      { type: "power", text: "تشغيل البوت عند الإقلاع", at: new Date(Date.now() - 3600000).toISOString() },
      { type: "settings", text: "تحميل إعدادات Ops الافتراضية", at: new Date(Date.now() - 3500000).toISOString() },
      { type: "ticket", text: "فتح TKT-0013 — مبيعات", at: new Date(Date.now() - 480000).toISOString() },
    ];
    saveState();
    renderAudit();
    renderOverviewActivity();
  }
})();
