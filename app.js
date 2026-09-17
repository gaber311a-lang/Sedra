(() => {
  "use strict";

  const CFG = window.OPS_CONFIG || {};
  const STORE_KEY = "ops-pro-v1";

  const MOD_TITLE = {
    overview: "نظرة عامة",
    tickets: "التذاكر",
    panel: "المنبر",
    roles: "الرتب والصلاحيات",
    smart: "الإعدادات الذكية",
    audit: "السجل",
  };

  const MOCK_USER = { id: "1", username: "Gaber", global_name: "جابر" };
  const MOCK_GUILDS = [
    { id: "111", name: "سيرفر جابر", owner: true, botPresent: true },
    { id: "222", name: "مجتمع الدعم", owner: true, botPresent: true },
    { id: "333", name: "متجر تجريبي", owner: true, botPresent: false },
    { id: "444", name: "سيرفر صديق", owner: false, botPresent: true },
  ];

  const defaultSettings = () => ({
    panel: {
      title: "مركز التذاكر",
      color: "#7C3AED",
      desc: "اختر التصنيف وافتح تذكرة — الدعم يرد بأسرع وقت.",
      welcome: "مرحباً بك. صف طلبك بوضوح.",
      channelId: "",
      categoryId: "",
      categories: [
        { name: "دعم فني", key: "support", color: "#5B4DFF" },
        { name: "مبيعات", key: "sales", color: "#A855F7" },
        { name: "شكوى", key: "complaint", color: "#F59E0B" },
        { name: "عامة", key: "general", color: "#8B5CF6" },
      ],
    },
    roles: { owner: "", member: "", support: "", admin: "" },
    smart: {
      auto: true,
      suggest: true,
      one: true,
      idle: true,
      close: true,
      sla: true,
      idleMin: 30,
      closeMin: 120,
      slaMin: 15,
      prio: "medium",
    },
    perms: {},
    audit: [],
  });

  const TICKETS = [
    { id: "TKT-0013", cat: "مبيعات", prio: "high", status: "open", who: "—", ago: "8 د" },
    { id: "TKT-0012", cat: "دعم فني", prio: "medium", status: "claimed", who: "نورة", ago: "12 د" },
    { id: "TKT-0011", cat: "شكوى", prio: "high", status: "claimed", who: "فهد", ago: "22 د" },
    { id: "TKT-0010", cat: "عامة", prio: "low", status: "open", who: "—", ago: "35 د" },
    { id: "TKT-0009", cat: "دعم فني", prio: "medium", status: "closed", who: "سارة", ago: "1 س" },
  ];
  const STATUS_AR = { open: "مفتوحة", claimed: "مُستلمة", closed: "مغلقة" };
  const PRIO_AR = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
  const PERM_ITEMS = [
    { id: "cmd_open", label: "/ticket فتح" },
    { id: "cmd_close", label: "/ticket إغلاق" },
    { id: "cmd_claim", label: "/ticket استلام" },
    { id: "btn_open", label: "زر فتح" },
    { id: "btn_close", label: "زر إغلاق" },
    { id: "btn_claim", label: "زر استلام" },
  ];
  const PERM_ROLES = ["everyone", "member", "support", "admin"];

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let store = loadStore();
  let session = null;
  let guildId = null;
  let ticketFilter = "all";

  function apiBase() {
    return String(window.OPS_API_BASE || CFG.API_BASE || "").replace(/\/$/, "");
  }
  function isLive() {
    return Boolean(apiBase()) && !store.mockMode;
  }
  function route(key, id) {
    let p = (CFG.routes && CFG.routes[key]) || "";
    if (id) p = p.replace(":guildId", id);
    return p;
  }
  async function api(pathname, opts = {}) {
    if (!isLive()) throw new Error("MOCK");
    const res = await fetch(apiBase() + pathname, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    if (res.status === 403) {
      showForbidden();
      throw new Error("403");
    }
    if (!res.ok) throw new Error("API " + res.status);
    if (res.status === 204) return null;
    return res.json();
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const base = { mockMode: !(window.OPS_API_BASE || CFG.API_BASE) && CFG.MOCK_DEFAULT !== false, guilds: {}, lastGuildId: null };
      return raw ? Object.assign(base, JSON.parse(raw)) : base;
    } catch {
      return { mockMode: !apiBase(), guilds: {}, lastGuildId: null };
    }
  }
  function saveStore() {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }
  function settings(id = guildId) {
    if (!id) return defaultSettings();
    if (!store.guilds[id]) store.guilds[id] = defaultSettings();
    return store.guilds[id];
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }
  function addAudit(type, text) {
    if (!guildId) return;
    const s = settings();
    s.audit.unshift({ type, text, at: new Date().toISOString() });
    s.audit = s.audit.slice(0, 50);
    saveStore();
    renderAudit();
    renderFeed();
  }

  function showMarketing() {
    $("marketing").hidden = false;
    $("dashboard").hidden = true;
    closeAuth();
  }
  function showDashboard() {
    $("marketing").hidden = true;
    $("dashboard").hidden = false;
  }
  function openAuth() {
    $("auth-modal").hidden = false;
  }
  function closeAuth() {
    $("auth-modal").hidden = true;
  }
  function showServers() {
    $("screen-servers").hidden = false;
    $("screen-guild").hidden = true;
    if ($("screen-forbidden")) $("screen-forbidden").hidden = true;
    $("guild-chip").hidden = true;
    closeSide();
    renderServers();
  }
  function showForbidden() {
    $("screen-servers").hidden = true;
    $("screen-guild").hidden = true;
    if ($("screen-forbidden")) $("screen-forbidden").hidden = false;
    toast("403 — الأونر فقط يقدر يعدّل إعدادات السيرفر");
  }
  function closeSide() {
    $("dash-side")?.classList.remove("is-open");
  }
  function openSide() {
    $("dash-side")?.classList.add("is-open");
  }

  function updateModeChip() {
    if ($("mode-chip")) $("mode-chip").textContent = isLive() ? "متصل بالـ API" : "تجريبي";
    if ($("toggle-mock")) $("toggle-mock").checked = store.mockMode;
  }

  function enterSession({ user, guilds, mock }) {
    session = { user, guilds, mock };
    if (mock) sessionStorage.setItem("ops-mock", "1");
    showDashboard();
    closeAuth();
    if ($("user-label")) $("user-label").textContent = user.global_name || user.username || "مستخدم";
    if ($("user-avatar")) $("user-avatar").textContent = (user.global_name || user.username || "?").slice(0, 1);
    updateModeChip();
    showServers();
    toast(mock ? "دخول تجريبي (محاكاة Discord)" : "تم تسجيل الدخول");
  }

  function loginDiscord() {
    const base = apiBase();
    if (base) {
      window.location.href = base + (route("login") || "/auth/discord");
      return;
    }
    toast("عيّن OPS_API_BASE أو استخدم الدخول التجريبي");
    $("auth-modal")?.querySelector(".mock-box")?.classList.add("pulse");
  }

  function inviteBot(gid) {
    const base = apiBase();
    if (base) {
      window.location.href = base + (route("invite") || "/invite");
      return;
    }
    if (gid && session) {
      const g = session.guilds.find((x) => x.id === gid);
      if (g) {
        g.botPresent = true;
        renderServers();
        toast("محاكاة دعوة البوت");
        return;
      }
    }
    const url =
      typeof CFG.inviteUrl === "function"
        ? CFG.inviteUrl(CFG.DISCORD_CLIENT_ID)
        : "https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=2147609616&scope=bot%20applications.commands";
    window.open(url, "_blank", "noopener");
  }

  async function logout() {
    if (isLive()) {
      try {
        await api(route("logout"), { method: "POST" });
      } catch (_) {}
    }
    sessionStorage.removeItem("ops-mock");
    session = null;
    guildId = null;
    showMarketing();
  }

  async function restoreSession() {
    if (isLive()) {
      try {
        const me = await api(route("me"));
        const g = await api(route("guilds"));
        enterSession({ user: me, guilds: g.guilds || g, mock: false });
        return;
      } catch (_) {}
    }
    if (sessionStorage.getItem("ops-mock") === "1") {
      enterSession({
        user: MOCK_USER,
        guilds: MOCK_GUILDS.map((g) => ({ ...g })),
        mock: true,
      });
    }
  }

  function renderServers() {
    const grid = $("server-grid");
    if (!grid || !session) return;
    const list = session.guilds || [];
    grid.innerHTML =
      list
        .map((g) => {
          let badge;
          let action;
          if (!g.owner) {
            badge = '<span class="badge warn">لست الأونر</span>';
            action = `<button type="button" class="btn btn-ghost btn-sm" data-deny="${g.id}">لا صلاحية</button>`;
          } else if (!g.botPresent) {
            badge = '<span class="badge warn">البوت غير موجود</span>';
            action = `<button type="button" class="btn btn-discord btn-sm" data-invite="${g.id}">إضافة البوت</button>`;
          } else {
            badge = '<span class="badge ok">الأونر · البوت جاهز</span>';
            action = `<button type="button" class="btn btn-gradient btn-sm" data-open="${g.id}">فتح الإعدادات</button>`;
          }
          return `<article class="server-tile glass-card ${g.owner && g.botPresent ? "" : "dim"}">
          <div class="server-icon">${esc((g.name || "?").slice(0, 1))}</div>
          <strong>${esc(g.name)}</strong>${badge}${action}</article>`;
        })
        .join("") ||
      '<p class="empty-hint">لا سيرفرات. ادعُ البوت لسيرفر تملكه (Owner).</p>';

    grid.querySelectorAll("[data-open]").forEach((b) => {
      b.onclick = () => openGuild(b.dataset.open);
    });
    grid.querySelectorAll("[data-invite]").forEach((b) => {
      b.onclick = () => inviteBot(b.dataset.invite);
    });
    grid.querySelectorAll("[data-deny]").forEach((b) => {
      b.onclick = () => showForbidden();
    });
  }

  async function openGuild(id) {
    const g = session?.guilds.find((x) => x.id === id);
    if (!g) return;
    if (!g.owner) return showForbidden();
    if (!g.botPresent) return toast("ادعُ البوت أولاً");

    guildId = id;
    store.lastGuildId = id;
    saveStore();

    if (isLive()) {
      try {
        const remote = await api(route("settings", id));
        if (remote) store.guilds[id] = Object.assign(defaultSettings(), remote);
        saveStore();
      } catch (e) {
        if (e.message === "403") return;
      }
    }

    $("screen-servers").hidden = true;
    if ($("screen-forbidden")) $("screen-forbidden").hidden = true;
    $("screen-guild").hidden = false;
    $("guild-chip").hidden = false;
    $("guild-chip").textContent = g.name;
    $("side-guild-name").textContent = g.name;
    $("side-guild-icon").textContent = (g.name || "S").slice(0, 1);
    if ($("ov-perm")) $("ov-perm").textContent = "مالك السيرفر (Owner)";
    fillForms();
    showMod("overview");
    renderTickets();
    renderAudit();
    renderFeed();
    tickStats();
  }

  function showMod(name) {
    ["overview", "tickets", "panel", "roles", "smart", "audit"].forEach((m) => {
      const el = $("mod-" + m);
      if (el) el.hidden = m !== name;
    });
    $$("[data-mod]").forEach((b) => b.classList.toggle("is-active", b.dataset.mod === name));
    if ($("mod-title")) $("mod-title").textContent = MOD_TITLE[name] || name;
    closeSide();
  }

  async function persist(section) {
    const g = session?.guilds.find((x) => x.id === guildId);
    if (!g?.owner) {
      showForbidden();
      return false;
    }
    saveStore();
    if (isLive()) {
      try {
        await api(route("settings", guildId), {
          method: "PUT",
          body: JSON.stringify({ section, settings: settings() }),
        });
      } catch (e) {
        if (e.message === "403") return false;
        toast("تعذّر الحفظ على الخادم — بقي محلياً");
        return false;
      }
    }
    return true;
  }

  function setVal(id, v) {
    const el = $(id);
    if (el) el.value = v ?? "";
  }
  function setCheck(id, v) {
    const el = $(id);
    if (el) el.checked = !!v;
  }

  function fillForms() {
    const s = settings();
    const p = s.panel;
    setVal("cfg-title", p.title);
    setVal("cfg-color", p.color);
    setVal("cfg-hex", p.color);
    setVal("cfg-desc", p.desc);
    setVal("cfg-welcome", p.welcome);
    setVal("cfg-channel", p.channelId);
    setVal("cfg-category", p.categoryId);
    updateGrad(p.color);
    renderCats();
    setVal("role-owner", s.roles.owner);
    setVal("role-member", s.roles.member);
    setVal("role-support", s.roles.support);
    setVal("role-admin", s.roles.admin);
    const sm = s.smart;
    setCheck("sm-auto", sm.auto);
    setCheck("sm-suggest", sm.suggest);
    setCheck("sm-one", sm.one);
    setCheck("sm-idle", sm.idle);
    setCheck("sm-close", sm.close);
    setCheck("sm-sla", sm.sla);
    setVal("sm-idle-min", sm.idleMin);
    setVal("sm-close-min", sm.closeMin);
    setVal("sm-sla-min", sm.slaMin);
    setVal("sm-prio", sm.prio);
    if ($("ov-smart")) $("ov-smart").textContent = sm.auto ? "مفعّل" : "متوقف";
    if ($("ov-bot")) $("ov-bot").textContent = "متصل";
    ensurePerms(s);
    renderPerms();
  }

  function updateGrad(color) {
    const el = $("grad-preview");
    if (el) el.style.background = `linear-gradient(135deg,#5B4DFF,${color},#A855F7)`;
  }

  function renderCats() {
    const list = $("cat-list");
    if (!list) return;
    const cats = settings().panel.categories;
    list.innerHTML = cats
      .map(
        (c, i) => `<li class="cat-row">
      <input type="color" value="${c.color}" data-i="${i}" data-f="color"/>
      <input type="text" value="${esc(c.name)}" data-i="${i}" data-f="name"/>
      <input type="text" class="en" dir="ltr" value="${esc(c.key)}" data-i="${i}" data-f="key"/>
      <button type="button" class="btn btn-ghost btn-sm" data-del="${i}">حذف</button>
    </li>`
      )
      .join("");
    list.querySelectorAll("input").forEach((inp) => {
      inp.onchange = () => {
        settings().panel.categories[+inp.dataset.i][inp.dataset.f] = inp.value;
      };
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        settings().panel.categories.splice(+btn.dataset.del, 1);
        renderCats();
      };
    });
  }

  function ensurePerms(s) {
    if (!s.perms || !Object.keys(s.perms).length) {
      s.perms = {};
      PERM_ITEMS.forEach((it) => {
        s.perms[it.id] = {
          everyone: it.id.includes("open"),
          member: true,
          support: true,
          admin: true,
        };
      });
    }
  }
  function renderPerms() {
    const body = $("perm-body");
    if (!body) return;
    const s = settings();
    ensurePerms(s);
    body.innerHTML = PERM_ITEMS.map((it) => {
      const row = s.perms[it.id] || {};
      return `<tr><td>${it.label}</td>${PERM_ROLES.map(
        (r) =>
          `<td><input type="checkbox" data-perm="${it.id}" data-role="${r}" ${row[r] ? "checked" : ""}/></td>`
      ).join("")}</tr>`;
    }).join("");
  }

  function renderTickets() {
    const q = ($("ticket-q")?.value || "").trim().toLowerCase();
    const rows = TICKETS.filter((t) => {
      if (ticketFilter !== "all" && t.status !== ticketFilter) return false;
      if (!q) return true;
      return t.id.toLowerCase().includes(q) || t.cat.includes(q);
    });
    if ($("tickets-body")) {
      $("tickets-body").innerHTML = rows
        .map(
          (t) => `<tr>
        <td class="en" dir="ltr">${t.id}</td><td>${t.cat}</td>
        <td><span class="prio ${t.prio}">${PRIO_AR[t.prio]}</span></td>
        <td><span class="status-chip ${t.status}">${STATUS_AR[t.status]}</span></td>
        <td>${t.who}</td><td>${t.ago}</td></tr>`
        )
        .join("");
    }
    if ($("tickets-cards")) {
      $("tickets-cards").innerHTML = rows
        .map(
          (t) => `<article class="ticket-card glass-card">
        <div><strong class="en" dir="ltr">${t.id}</strong>
        <span class="status-chip ${t.status}">${STATUS_AR[t.status]}</span></div>
        <div>${t.cat} · <span class="prio ${t.prio}">${PRIO_AR[t.prio]}</span></div>
        <div class="muted">${t.who} · ${t.ago}</div></article>`
        )
        .join("");
    }
  }

  function renderAudit() {
    const el = $("audit-list");
    if (!el) return;
    const items = settings().audit.length
      ? settings().audit
      : [
          { type: "power", text: "البوت جاهز على السيرفر", at: new Date(Date.now() - 36e5).toISOString() },
          { type: "settings", text: "تحميل إعدادات افتراضية", at: new Date(Date.now() - 35e5).toISOString() },
        ];
    el.innerHTML = items
      .map(
        (a) =>
          `<li><span class="audit-badge">${a.type}</span><span>${esc(a.text)}</span><time>${fmt(a.at)}</time></li>`
      )
      .join("");
  }
  function renderFeed() {
    const el = $("ov-feed");
    if (!el) return;
    const items = (settings().audit.length
      ? settings().audit
      : [
          { text: "TKT-0013 — مبيعات", at: new Date(Date.now() - 48e4).toISOString() },
          { text: "استلام TKT-0012", at: new Date(Date.now() - 72e4).toISOString() },
        ]
    ).slice(0, 5);
    el.innerHTML = items
      .map((a) => `<li><span class="dot"></span><span>${esc(a.text)}</span><time>${rel(a.at)}</time></li>`)
      .join("");
  }
  function tickStats() {
    const j = (n, d = 2) => Math.max(0, n + Math.round((Math.random() - 0.5) * d));
    if ($("st-open")) $("st-open").textContent = j(12);
    if ($("st-claimed")) $("st-claimed").textContent = j(7);
    if ($("st-closed")) $("st-closed").textContent = j(23, 3);
    if ($("st-sla")) $("st-sla").textContent = `${92 + Math.floor(Math.random() * 5)}%`;
  }
  function rel(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return "الآن";
    if (m < 60) return `منذ ${m} د`;
    return `منذ ${Math.round(m / 60)} س`;
  }
  function fmt(iso) {
    try {
      return new Date(iso).toLocaleString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
      });
    } catch {
      return iso;
    }
  }

  function bind() {
    ["btn-nav-invite", "btn-hero-invite", "btn-cta-invite", "btn-invite-global"].forEach((id) => {
      $(id)?.addEventListener("click", () => inviteBot());
    });
    ["btn-nav-dash", "btn-hero-dash", "btn-cta-dash"].forEach((id) => {
      $(id)?.addEventListener("click", () => (session ? showServers() : openAuth()));
    });
    $("brand-home")?.addEventListener("click", (e) => {
      e.preventDefault();
      session ? showServers() : showMarketing();
    });
    $("mkt-burger")?.addEventListener("click", () => {
      document.querySelector(".mkt-nav, .mkt-links")?.classList.toggle("is-open");
    });
    $$("[data-close-auth]").forEach((el) => el.addEventListener("click", closeAuth));
    $("btn-discord-login")?.addEventListener("click", loginDiscord);
    $("btn-mock-login")?.addEventListener("click", () => {
      store.mockMode = true;
      saveStore();
      enterSession({ user: MOCK_USER, guilds: MOCK_GUILDS.map((g) => ({ ...g })), mock: true });
    });
    $("toggle-mock")?.addEventListener("change", (e) => {
      store.mockMode = e.target.checked;
      saveStore();
      updateModeChip();
    });

    $("user-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = $("user-dropdown");
      if (dd) dd.hidden = !dd.hidden;
    });
    document.addEventListener("click", () => {
      if ($("user-dropdown")) $("user-dropdown").hidden = true;
    });
    $("btn-goto-servers")?.addEventListener("click", showServers);
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-servers-home")?.addEventListener("click", showServers);
    $("btn-change-server")?.addEventListener("click", showServers);
    $("btn-forbidden-back")?.addEventListener("click", showServers);

    $$("[data-mod]").forEach((b) => b.addEventListener("click", () => showMod(b.dataset.mod)));
    $$("[data-goto]").forEach((b) => b.addEventListener("click", () => showMod(b.dataset.goto)));
    $("btn-open-side")?.addEventListener("click", openSide);
    $("side-toggle-mobile")?.addEventListener("click", closeSide);

    $("cfg-color")?.addEventListener("input", (e) => {
      setVal("cfg-hex", e.target.value);
      updateGrad(e.target.value);
    });
    $("cfg-hex")?.addEventListener("change", (e) => {
      let v = e.target.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        setVal("cfg-color", v);
        updateGrad(v);
      }
    });

    $("form-panel")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = settings().panel;
      p.title = $("cfg-title").value.trim();
      p.color = $("cfg-hex").value.trim() || "#7C3AED";
      p.desc = $("cfg-desc").value.trim();
      p.welcome = $("cfg-welcome").value.trim();
      p.channelId = $("cfg-channel").value.trim();
      p.categoryId = $("cfg-category").value.trim();
      if (!(await persist("panel"))) return;
      if (isLive()) {
        try {
          await api(route("panel", guildId), { method: "POST", body: JSON.stringify(p) });
        } catch (_) {}
      }
      addAudit("settings", "تحديث المنبر");
      toast("حُفظ المنبر");
    });

    $("btn-add-cat")?.addEventListener("click", () => {
      settings().panel.categories.push({ name: "تصنيف جديد", key: "new", color: "#A855F7" });
      renderCats();
    });

    $("form-roles")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      settings().roles = {
        owner: $("role-owner").value.trim(),
        member: $("role-member").value.trim(),
        support: $("role-support").value.trim(),
        admin: $("role-admin").value.trim(),
      };
      if (!(await persist("roles"))) return;
      addAudit("settings", "تحديث الرتب");
      toast("حُفظت الرتب (الأونر فقط)");
    });

    $("btn-save-perms")?.addEventListener("click", async () => {
      const s = settings();
      ensurePerms(s);
      $$("#perm-body input").forEach((cb) => {
        if (!s.perms[cb.dataset.perm]) s.perms[cb.dataset.perm] = {};
        s.perms[cb.dataset.perm][cb.dataset.role] = cb.checked;
      });
      if (!(await persist("perms"))) return;
      addAudit("settings", "تحديث الصلاحيات");
      toast("حُفظت الصلاحيات");
    });

    $("form-smart")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      settings().smart = {
        auto: $("sm-auto").checked,
        suggest: $("sm-suggest").checked,
        one: $("sm-one").checked,
        idle: $("sm-idle").checked,
        close: $("sm-close").checked,
        sla: $("sm-sla").checked,
        idleMin: +$("sm-idle-min").value || 30,
        closeMin: +$("sm-close-min").value || 120,
        slaMin: +$("sm-sla-min").value || 15,
        prio: $("sm-prio").value,
      };
      if (!(await persist("smart"))) return;
      if ($("ov-smart")) $("ov-smart").textContent = settings().smart.auto ? "مفعّل" : "متوقف";
      addAudit("settings", "تحديث الإعدادات الذكية");
      toast("حُفظت الإعدادات الذكية");
    });

    const filters = $("ticket-filters");
    if (filters) {
      filters.querySelectorAll("[data-f], .chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          filters.querySelectorAll(".chip, [data-f]").forEach((c) => c.classList.remove("is-active"));
          chip.classList.add("is-active");
          ticketFilter = chip.dataset.f || "all";
          renderTickets();
        });
      });
    }
    $("ticket-q")?.addEventListener("input", renderTickets);
    $("btn-refresh-audit")?.addEventListener("click", () => {
      addAudit("settings", "تحديث السجل");
      toast("تم التحديث");
    });
    $$("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copy);
          toast("تم النسخ");
        } catch {
          toast("انسخ يدوياً");
        }
      });
    });
  }

  if (apiBase()) store.mockMode = false; // live API tunnel configured
  bind();
  updateModeChip();
  restoreSession();
  setInterval(() => {
    if (guildId && $("screen-guild") && !$("screen-guild").hidden) tickStats();
  }, 12000);
})();
