(() => {
  "use strict";

  const CFG = window.OPS_CONFIG || {};
  const STORE_KEY = "ops-multiscreen-v1";
  const MOD_TITLES = {
    overview: "نظرة عامة",
    tickets: "التذاكر",
    panel: "المنبر",
    roles: "الرتب",
    smart: "الذكي",
    logs: "السجل",
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
      desc: "اختر التصنيف وافتح تذكرة.",
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
  function rpath(key, id) {
    let p = (CFG.routes && CFG.routes[key]) || "";
    if (id) p = p.replace(":guildId", id);
    return p;
  }
  async function api(path, opts = {}) {
    const base = apiBase();
    if (!base) throw new Error("NO_API");
    const res = await fetch(base + path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    if (res.status === 403) {
      location.hash = "#/forbidden";
      throw new Error("403");
    }
    if (!res.ok) throw new Error("API " + res.status);
    if (res.status === 204) return null;
    return res.json();
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const base = { guilds: {}, lastGuildId: null };
      return raw ? Object.assign(base, JSON.parse(raw)) : base;
    } catch {
      return { guilds: {}, lastGuildId: null };
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
    renderLogs();
    renderFeed();
  }

  /* ===== Hash router — one full screen ===== */
  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "login") return { screen: "login" };
    if (parts[0] === "servers") return { screen: "servers" };
    if (parts[0] === "forbidden") return { screen: "forbidden" };
    if (parts[0] === "g" && parts[1]) {
      const mod = parts[2] && MOD_TITLES[parts[2]] ? parts[2] : "overview";
      return { screen: "guild", guildId: parts[1], mod };
    }
    return { screen: "landing" };
  }

  function go(hash) {
    if (!hash.startsWith("#")) hash = "#" + hash;
    if (location.hash === hash) applyRoute();
    else location.hash = hash;
  }

  function showScreen(name) {
    ["landing", "login", "servers", "guild", "forbidden"].forEach((n) => {
      const el = $("screen-" + n);
      if (!el) return;
      const on = n === name;
      el.hidden = !on;
      el.classList.toggle("is-active", on);
    });
    window.scrollTo(0, 0);
    closeSide();
  }

  function applyRoute() {
    const r = parseHash();

    if (r.screen === "landing") {
      showScreen("landing");
      return;
    }
    if (r.screen === "login") {
      if (session) return go("#/servers");
      showScreen("login");
      return;
    }
    if (r.screen === "forbidden") {
      showScreen("forbidden");
      return;
    }
    if (r.screen === "servers") {
      if (!session) return go("#/login");
      showScreen("servers");
      renderServers();
      return;
    }
    if (r.screen === "guild") {
      if (!session) return go("#/login");
      const g = session.guilds.find((x) => x.id === r.guildId);
      if (!g) return go("#/servers");
      if (!g.owner) return go("#/forbidden");
      if (!g.botPresent) {
        toast("أضف البوت لهذا السيرفر أولاً");
        return go("#/servers");
      }
      guildId = r.guildId;
      store.lastGuildId = guildId;
      saveStore();
      showScreen("guild");
      paintGuild(g);
      showMod(r.mod || "overview");
    }
  }

  function paintGuild(g) {
    $("side-guild-name").textContent = g.name;
    $("side-guild-icon").textContent = (g.name || "S").slice(0, 1);
    $("guild-chip").textContent = g.name;
    $$(".side-link[data-mod]").forEach((a) => {
      a.href = `#/g/${g.id}/${a.dataset.mod}`;
    });
    fillForms();
    renderTickets();
    renderLogs();
    renderFeed();
    tickStats();
  }

  function showMod(name) {
    Object.keys(MOD_TITLES).forEach((m) => {
      const el = $("mod-" + m);
      if (el) el.hidden = m !== name;
    });
    $$(".side-link[data-mod]").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.mod === name);
    });
    $("mod-title").textContent = MOD_TITLES[name] || name;
  }

  function openSide() {
    $("sidebar")?.classList.add("is-open");
    if ($("sidebar-backdrop")) $("sidebar-backdrop").hidden = false;
  }
  function closeSide() {
    $("sidebar")?.classList.remove("is-open");
    if ($("sidebar-backdrop")) $("sidebar-backdrop").hidden = true;
  }

  /* ===== Auth ===== */
  function setUserChrome(user, mock) {
    $("user-label").textContent = user.global_name || user.username || "مستخدم";
    $("user-avatar").textContent = (user.global_name || user.username || "?").slice(0, 1);
    $("mode-chip").textContent = mock ? "تجريبي" : "متصل · Railway";
  }

  function enterSession({ user, guilds, mock }) {
    session = { user, guilds, mock };
    if (mock) sessionStorage.setItem("ops-mock", "1");
    setUserChrome(user, mock);
    go("#/servers");
    toast(mock ? "دخول تجريبي" : "تم تسجيل الدخول");
  }

  function loginDiscord() {
    const base = apiBase();
    if (!base) {
      toast("OPS_API_BASE غير مضبوط");
      return;
    }
    window.location.href = base + (rpath("login") || "/auth/discord");
  }

  async function inviteBot() {
    const base = apiBase();
    const fallback = () => {
      const url =
        CFG.inviteUrl?.(CFG.DISCORD_CLIENT_ID || "1550187468102438994") ||
        "https://discord.com/api/oauth2/authorize?client_id=1550187468102438994&permissions=2147609616&scope=bot%20applications.commands";
      window.location.href = url;
    };
    if (!base) {
      fallback();
      return;
    }
    try {
      const res = await fetch(base + (rpath("invite") || "/invite"), {
        credentials: "include",
      });
      const data = await res.json();
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
    } catch (_) {}
    fallback();
  }

  async function logout() {
    if (apiBase()) {
      try {
        await api(rpath("logout"), { method: "POST" });
      } catch (_) {}
    }
    sessionStorage.removeItem("ops-mock");
    session = null;
    guildId = null;
    go("#/");
  }

  async function restoreSession() {
    if (apiBase()) {
      try {
        const me = await api(rpath("me"));
        const g = await api(rpath("guilds"));
        session = { user: me, guilds: g.guilds || g, mock: false };
        setUserChrome(me, false);
        applyRoute();
        return;
      } catch (_) {}
    }
    if (sessionStorage.getItem("ops-mock") === "1") {
      session = {
        user: MOCK_USER,
        guilds: MOCK_GUILDS.map((g) => ({ ...g })),
        mock: true,
      };
      setUserChrome(MOCK_USER, true);
    }
    applyRoute();
  }

  /* ===== Servers ===== */
  function renderServers() {
    const grid = $("server-grid");
    if (!grid || !session) return;
    grid.innerHTML =
      session.guilds
        .map((g) => {
          let badge, action;
          if (!g.owner) {
            badge = '<span class="badge warn">لست الأونر</span>';
            action = `<button type="button" class="btn btn-ghost btn-sm" data-deny>لا صلاحية</button>`;
          } else if (!g.botPresent) {
            badge = '<span class="badge warn">بدون بوت</span>';
            action = `<button type="button" class="btn btn-discord btn-sm" data-inv="${g.id}">إضافة البوت</button>`;
          } else {
            badge = '<span class="badge ok">جاهز</span>';
            action = `<a class="btn btn-grad btn-sm" href="#/g/${g.id}/overview">فتح التحكم</a>`;
          }
          return `<article class="server-tile ${g.owner && g.botPresent ? "" : "dim"}">
            <div class="server-icon">${esc((g.name || "?").slice(0, 1))}</div>
            <strong>${esc(g.name)}</strong>${badge}${action}</article>`;
        })
        .join("") || '<p class="empty">لا سيرفرات.</p>';

    grid.querySelectorAll("[data-deny]").forEach((b) => {
      b.onclick = () => go("#/forbidden");
    });
    grid.querySelectorAll("[data-inv]").forEach((b) => {
      b.onclick = () => {
        if (!apiBase()) {
          const g = session.guilds.find((x) => x.id === b.dataset.inv);
          if (g) {
            g.botPresent = true;
            renderServers();
            toast("محاكاة إضافة البوت");
            return;
          }
        }
        inviteBot();
      };
    });
  }

  /* ===== Persist ===== */
  async function persist(section) {
    const g = session?.guilds.find((x) => x.id === guildId);
    if (!g?.owner) {
      go("#/forbidden");
      return false;
    }
    saveStore();
    if (apiBase()) {
      try {
        await api(rpath("settings", guildId), {
          method: "PUT",
          body: JSON.stringify({ section, settings: settings() }),
        });
      } catch (e) {
        if (e.message === "403") return false;
        toast("حُفظ محلياً — تعذّر المزامنة");
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

  function updateGrad(c) {
    const el = $("grad-preview");
    if (el) el.style.background = `linear-gradient(135deg,#5B4DFF,${c},#A855F7)`;
  }

  function renderCats() {
    const list = $("cat-list");
    if (!list) return;
    const cats = settings().panel.categories;
    list.innerHTML = cats
      .map(
        (c, i) => `<li class="cat-row">
        <input type="color" value="${c.color}" data-i="${i}" data-f="color" />
        <input type="text" value="${esc(c.name)}" data-i="${i}" data-f="name" />
        <input type="text" class="en" dir="ltr" value="${esc(c.key)}" data-i="${i}" data-f="key" />
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
          `<td><input type="checkbox" data-perm="${it.id}" data-role="${r}" ${
            row[r] ? "checked" : ""
          } /></td>`
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
    const body = $("tickets-body");
    if (!body) return;
    body.innerHTML = rows
      .map(
        (t) => `<tr>
        <td class="en" dir="ltr">${t.id}</td><td>${t.cat}</td>
        <td><span class="prio ${t.prio}">${PRIO_AR[t.prio]}</span></td>
        <td><span class="status-chip ${t.status}">${STATUS_AR[t.status]}</span></td>
        <td>${t.who}</td><td>${t.ago}</td>
        <td><button type="button" class="btn btn-ghost btn-sm" data-claim="${t.id}">استلام</button></td>
      </tr>`
      )
      .join("");
    body.querySelectorAll("[data-claim]").forEach((b) => {
      b.onclick = () => {
        addAudit("ticket", "استلام " + b.dataset.claim);
        toast("تم الاستلام (تجريبي)");
      };
    });
  }

  function renderLogs() {
    const el = $("audit-list");
    if (!el) return;
    const items = settings().audit.length
      ? settings().audit
      : [
          { type: "power", text: "البوت جاهز", at: new Date(Date.now() - 36e5).toISOString() },
          { type: "settings", text: "تحميل إعدادات", at: new Date(Date.now() - 35e5).toISOString() },
        ];
    el.innerHTML = items
      .map(
        (a) =>
          `<li><span class="audit-badge">${a.type}</span><span>${esc(a.text)}</span><time>${fmt(
            a.at
          )}</time></li>`
      )
      .join("");
  }
  function renderFeed() {
    const el = $("ov-feed");
    if (!el) return;
    const items = (settings().audit.length
      ? settings().audit
      : [{ text: "TKT-0013 مبيعات", at: new Date().toISOString() }]
    ).slice(0, 5);
    el.innerHTML = items
      .map(
        (a) =>
          `<li><span class="dot"></span><span>${esc(a.text)}</span><time>${rel(a.at)}</time></li>`
      )
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

  /* ===== Bind ===== */
  function bind() {
    window.addEventListener("hashchange", applyRoute);

    $$("[data-invite]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        inviteBot();
      })
    );

    $("btn-discord-login")?.addEventListener("click", loginDiscord);
    $("btn-mock-login")?.addEventListener("click", () => {
      enterSession({
        user: MOCK_USER,
        guilds: MOCK_GUILDS.map((g) => ({ ...g })),
        mock: true,
      });
    });
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-logout-side")?.addEventListener("click", logout);
    $("btn-invite-global")?.addEventListener("click", inviteBot);
    $("btn-side-open")?.addEventListener("click", openSide);
    $("sidebar-backdrop")?.addEventListener("click", closeSide);

    $$(".btn[data-mod]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!guildId) return;
        go(`#/g/${guildId}/${a.dataset.mod}`);
      });
    });

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
      addAudit("settings", "حفظ المنبر");
      toast("حُفظ المنبر");
    });

    $("btn-publish-panel")?.addEventListener("click", async () => {
      if (!(await persist("panel"))) return;
      if (apiBase()) {
        try {
          await api(rpath("panel", guildId), {
            method: "POST",
            body: JSON.stringify(settings().panel),
          });
          toast("نُشر المنبر للقناة");
        } catch {
          toast("تعذّر النشر — تحقق من الـ API و Redirect URI");
        }
      } else toast("نُشر المنبر (تجريبي)");
      addAudit("panel", "نشر المنبر");
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
      addAudit("settings", "حفظ الرتب");
      toast("حُفظت الرتب");
    });

    $("btn-save-perms")?.addEventListener("click", async () => {
      const s = settings();
      ensurePerms(s);
      $$("#perm-body input").forEach((cb) => {
        if (!s.perms[cb.dataset.perm]) s.perms[cb.dataset.perm] = {};
        s.perms[cb.dataset.perm][cb.dataset.role] = cb.checked;
      });
      if (!(await persist("perms"))) return;
      addAudit("settings", "حفظ الصلاحيات");
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
      addAudit("settings", "حفظ الذكي");
      toast("حُفظت الإعدادات الذكية");
    });

    $("ticket-filters")?.querySelectorAll(".chip-btn, button[data-f]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("ticket-filters")
          .querySelectorAll(".chip-btn, button[data-f]")
          .forEach((b) => b.classList.remove("is-on", "is-active"));
        btn.classList.add("is-on");
        ticketFilter = btn.dataset.f || "all";
        renderTickets();
      });
    });
    $("ticket-q")?.addEventListener("input", renderTickets);
    $("btn-refresh-logs")?.addEventListener("click", () => {
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

  bind();
  restoreSession();
})();
