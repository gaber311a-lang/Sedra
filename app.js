(() => {
  "use strict";

  const CFG = window.OPS_CONFIG || {};
  const MOD_TITLES = {
    overview: "نظرة عامة",
    tickets: "التذاكر",
    panel: "المنبر",
    roles: "الرتب",
    smart: "السلوك",
    logs: "السجل",
  };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let session = null;
  let guildId = null;
  let ticketFilter = "all";
  let lastTickets = [];

  // Purge legacy mock flags from older builds
  try {
    sessionStorage.removeItem("ops-mock");
    ["ops-mock", "ops-multiscreen-v1", "ops-pro-v1", "ops-screens-v1", "ops-multi-v2", "ops-dashboard-v1", "ops-multi-v1"].forEach((k) =>
      localStorage.removeItem(k)
    );
  } catch (_) {}

  const TOKYO_TOKEN_KEY = "tokyo_auth_token";

  function getAuthToken() {
    try {
      return sessionStorage.getItem(TOKYO_TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }
  function setAuthToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKYO_TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKYO_TOKEN_KEY);
    } catch (_) {}
  }
  function clearAuthToken() {
    setAuthToken("");
  }

  /** Parse `#/servers?login_code=...` style hash query */
  function hashQuery() {
    const params = new URLSearchParams();
    // Support: #/servers?login_code=...  and  ?login_code=...#/servers
    try {
      const search = new URLSearchParams(location.search || "");
      search.forEach((v, k) => params.set(k, v));
    } catch (_) {}
    const h = location.hash || "";
    const i = h.indexOf("?");
    if (i >= 0) {
      try {
        const hp = new URLSearchParams(h.slice(i + 1));
        hp.forEach((v, k) => params.set(k, v));
      } catch (_) {}
    }
    return params;
  }
  function clearHashQueryKeepPath(path) {
    location.hash = path || "#/servers";
  }

    function apiBase() {
    return String(window.OPS_API_BASE || CFG.API_BASE || "").replace(/\/$/, "");
  }
  function route(key, id) {
    let p = (CFG.routes && CFG.routes[key]) || "";
    if (id) p = p.replace(/:guildId/g, encodeURIComponent(id));
    return p;
  }

  async function api(path, opts = {}) {
    const base = apiBase();
    if (!base) throw Object.assign(new Error("NO_API"), { code: "NO_API" });
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const token = getAuthToken();
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(base + path, {
      credentials: "include",
      ...opts,
      headers,
    });
    if (res.status === 401) {
      session = null;
      guildId = null;
      go("#/login");
      throw Object.assign(new Error("401"), { code: "401" });
    }
    if (res.status === 403) {
      go("#/forbidden");
      throw Object.assign(new Error("403"), { code: "403" });
    }
    if (res.status === 404 || res.status === 501) {
      throw Object.assign(new Error("UNAVAILABLE"), { code: "UNAVAILABLE", status: res.status });
    }
    if (!res.ok) throw Object.assign(new Error("API " + res.status), { code: "API", status: res.status });
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") return null;
    const u = raw.user || raw.me || raw;
    if (!u.id && !u.username) return null;
    return {
      id: String(u.id || ""),
      username: u.username || "",
      global_name: u.global_name || u.globalName || u.display_name || u.username || "",
      avatar: u.avatar || null,
    };
  }

  function normalizeGuild(g) {
    if (!g || typeof g !== "object") return null;
    const id = String(g.id || g.guildId || g.guild_id || "");
    const name = g.name || g.guildName || g.guild_name || "";
    if (!id || !name) return null;
    const icon = g.icon || g.iconHash || g.icon_hash || null;
    const iconUrl =
      g.iconUrl ||
      g.icon_url ||
      g.iconURL ||
      (icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.webp?size=128` : null);
    const owner = g.owner === true || g.isOwner === true || g.is_owner === true;
    const botPresent =
      g.botPresent === true ||
      g.bot_present === true ||
      g.hasBot === true ||
      g.has_bot === true ||
      g.joined === true;
    return { id, name, icon, iconUrl, owner, botPresent };
  }

  function normalizeGuildList(payload) {
    let arr = [];
    if (Array.isArray(payload)) arr = payload;
    else if (payload && Array.isArray(payload.guilds)) arr = payload.guilds;
    else if (payload && Array.isArray(payload.data)) arr = payload.data;
    else if (payload && Array.isArray(payload.items)) arr = payload.items;
    else if (payload && Array.isArray(payload.servers)) arr = payload.servers;
    return arr.map(normalizeGuild).filter(Boolean);
  }

  function guildIconHtml(g) {
    const alt = esc(g.name || "سيرفر");
    if (g.iconUrl) {
      return `<img class="server-icon-img" src="${esc(g.iconUrl)}" alt="${alt}" width="70" height="70" loading="lazy" decoding="async" />`;
    }
    return `<div class="server-icon" aria-hidden="true">${esc((g.name || "?").trim().slice(0, 1))}</div>`;
  }

  /* -------- Router -------- */
  function parseHash() {
    let raw = (location.hash || "#/").replace(/^#/, "") || "/";
    // Critical: "#/servers?login_code=..." must still parse as servers
    raw = raw.split("?")[0];
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "login") return { screen: "login" };
    if (parts[0] === "servers") return { screen: "servers" };
    if (parts[0] === "forbidden") return { screen: "forbidden" };
    if (parts[0] === "g" && parts[1]) {
      const id = String(parts[1]).split("?")[0];
      const modRaw = parts[2] ? String(parts[2]).split("?")[0] : "";
      const mod = modRaw && MOD_TITLES[modRaw] ? modRaw : "overview";
      return { screen: "guild", guildId: id, mod };
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
      el.hidden = n !== name;
      el.classList.toggle("is-active", n === name);
    });
    window.scrollTo(0, 0);
    closeSide();
  }

  function applyRoute() {
    const r = parseHash();
    if (r.screen === "landing") return showScreen("landing");
    if (r.screen === "login") {
      if (session) return go("#/servers");
      return showScreen("login");
    }
    if (r.screen === "forbidden") return showScreen("forbidden");
    if (r.screen === "servers") {
      if (!session) {
        // Avoid dead login loop — send to home with clear action
        toast("سجّل دخولك عشان تفتح لوحة التحكم");
        return go("#/");
      }
      showScreen("servers");
      return loadAndRenderGuilds();
    }
    if (r.screen === "guild") {
      if (!session) {
        toast("سجّل دخولك عشان تفتح لوحة التحكم");
        return go("#/");
      }
      const g = (session.guilds || []).find((x) => x.id === r.guildId);
      if (!g) return go("#/servers");
      if (!g.owner) return go("#/forbidden");
      if (!g.botPresent) {
        toast("أضف البوت لهذا السيرفر أول");
        return go("#/servers");
      }
      guildId = r.guildId;
      showScreen("guild");
      paintGuildChrome(g);
      showMod(r.mod);
      return loadGuildModuleData(r.mod);
    }
  }

  /* -------- Auth -------- */
  function setUserChrome(user) {
    if ($("user-label")) $("user-label").textContent = user.global_name || user.username || "مستخدم";
    if ($("user-avatar")) $("user-avatar").textContent = (user.global_name || user.username || "?").slice(0, 1);
    if ($("mode-chip")) $("mode-chip").textContent = "متصل";
  }

  function loginDiscord() {
    const base = apiBase();
    if (!base) return toast("الخدمة مو متصلة");
    // Full page navigation to API (sets state cookie / starts OAuth)
    window.location.assign(base + (route("login") || "/auth/discord"));
  }

  async function inviteBot() {
    const base = apiBase();
    if (!base) return toast("الخدمة مو متصلة");
    try {
      const res = await fetch(base + (route("invite") || "/invite"), { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.url) {
          window.location.href = data.url;
          return;
        }
      }
    } catch (_) {}
    if (typeof CFG.inviteUrl === "function" && CFG.DISCORD_CLIENT_ID) {
      window.location.href = CFG.inviteUrl(CFG.DISCORD_CLIENT_ID);
      return;
    }
    toast("ما قدرنا نفتح دعوة البوت");
  }

  async function logout() {
    if (apiBase()) {
      try {
        await api(route("logout") || "/auth/logout", { method: "POST" });
      } catch (_) {}
    }
    clearAuthToken();
    session = null;
    guildId = null;
    go("#/");
  }


  async function exchangeLoginCode(code) {
    const base = apiBase();
    if (!base || !code) return false;
    const res = await fetch(base + "/auth/exchange", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Object.assign(new Error(err.error || "exchange_failed"), { code: err.error || "exchange_failed", status: res.status });
    }
    const data = await res.json();
    if (!data || !data.token) throw new Error("no_token");
    setAuthToken(data.token);
    return data;
  }

  async function restoreSession() {
    if (!apiBase()) {
      applyRoute();
      return;
    }

    // Finish Discord login handoff: #/servers?login_code=...
    const hq = hashQuery();
    const loginCode = (hq.get("login_code") || hq.get("code") || "").trim();
    const oauthErr = hq.get("error");
    if (oauthErr) {
      toast("ما تم الدخول. حاول مرة ثانية.");
      clearHashQueryKeepPath("#/login");
      applyRoute();
      return;
    }
    if (loginCode) {
      try {
        toast("يجري تسجيل الدخول…");
        await exchangeLoginCode(loginCode);
        history.replaceState({}, "", location.pathname + "#/servers");
        toast("تم تسجيل الدخول");
        const meRaw = await api(route("me") || "/auth/me");
        const user = normalizeUser(meRaw);
        if (!user) throw new Error("NO_USER");
        session = { user, guilds: [] };
        setUserChrome(user);
        try { await fetchGuilds(); } catch (_) {}
        applyRoute();
        return;
      } catch (e) {
        clearAuthToken();
        toast(e && e.status === 404 ? "خدمة الدخول مو جاهزة بعد" : "ما قدرنا نكمّل الدخول. اضغط تسجيل الدخول مرة ثانية.");
        clearHashQueryKeepPath("#/login");
        applyRoute();
        return;
      }
    }

    try {
      const meRaw = await api(route("me") || "/auth/me");
      const user = normalizeUser(meRaw);
      if (!user) throw new Error("NO_USER");
      session = { user, guilds: [] };
      setUserChrome(user);
      let r = parseHash();
      if (r.screen === "landing" || r.screen === "login") {
        location.hash = "#/servers";
        r = { screen: "servers" };
      }
      if (r.screen === "servers" || r.screen === "guild") {
        try {
          await fetchGuilds();
        } catch (_) {}
      }
      applyRoute();
    } catch (_) {
      session = null;
      applyRoute();
    }
  }

  async function fetchGuilds() {
    const raw = await api(route("guilds") || "/api/guilds");
    const list = normalizeGuildList(raw).filter((g) => g.owner);
    if (!session) session = { user: { username: "?" }, guilds: [] };
    session.guilds = list;
    return list;
  }

  function setServersError(msg) {
    const box = $("servers-error");
    const text = $("servers-error-text");
    if (!box) return;
    if (!msg) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (text) text.textContent = msg;
  }

  async function loadAndRenderGuilds() {
    const grid = $("server-grid");
    if (grid) grid.innerHTML = '<p class="empty">يحمّل السيرفرات…</p>';
    setServersError(null);
    try {
      await fetchGuilds();
      renderServers();
    } catch (_) {
      if (grid) grid.innerHTML = "";
      setServersError("ما قدرنا نحمّل السيرفرات. تأكد إنك داخل وأعد المحاولة.");
    }
  }

  function renderServers() {
    const grid = $("server-grid");
    if (!grid || !session) return;
    const guilds = session.guilds || [];
    const tiles = guilds
      .map((g) => {
        const badge = g.botPresent
          ? '<span class="badge ok">جاهز</span>'
          : '<span class="badge warn">البوت مو موجود</span>';
        const action = g.botPresent
          ? `<a class="btn btn-grad btn-sm" href="#/g/${esc(g.id)}/overview">فتح</a>`
          : `<button type="button" class="btn btn-discord btn-sm" data-inv>إضافة البوت</button>`;
        return `<article class="server-tile ${g.botPresent ? "" : "dim"}">
          ${guildIconHtml(g)}
          <strong>${esc(g.name)}</strong>
          ${badge}${action}
        </article>`;
      })
      .join("");

    const addTile = `<article class="server-tile server-tile-add" id="tile-add-server" role="button" tabindex="0">
      <div class="server-icon add-plus" aria-hidden="true">+</div>
      <strong>إضافة سيرفر</strong>
      <span class="badge ok">دعوة البوت</span>
      <button type="button" class="btn btn-discord btn-sm" data-invite-new>إضافة البوت</button>
    </article>`;

    grid.innerHTML =
      (tiles ||
        '<p class="empty">ما فيه سيرفرات تملكها ظاهرة. اضغط إضافة سيرفر جديد لدعوة البوت.</p>') +
      addTile;

    grid.querySelectorAll("[data-inv], [data-invite-new]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        inviteBot();
      };
    });
    const add = $("tile-add-server");
    if (add) {
      add.onclick = (e) => {
        if (e.target.closest("button")) return;
        inviteBot();
      };
      add.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inviteBot();
        }
      };
    }
  }

  /* -------- Guild chrome / modules -------- */
  function paintGuildChrome(g) {
    if ($("side-guild-name")) $("side-guild-name").textContent = g.name;
    const icon = $("side-guild-icon");
    if (icon) {
      if (g.iconUrl) {
        icon.innerHTML = `<img src="${esc(g.iconUrl)}" alt="${esc(g.name)}" width="40" height="40" />`;
        icon.classList.add("has-img");
      } else {
        icon.textContent = (g.name || "S").slice(0, 1);
        icon.classList.remove("has-img");
      }
    }
    if ($("guild-chip")) $("guild-chip").textContent = g.name;
    $$(".side-link[data-mod]").forEach((a) => {
      a.href = `#/g/${g.id}/${a.dataset.mod}`;
    });
  }

  function showMod(name) {
    Object.keys(MOD_TITLES).forEach((m) => {
      const el = $("mod-" + m);
      if (el) el.hidden = m !== name;
    });
    $$(".side-link[data-mod]").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.mod === name);
    });
    if ($("mod-title")) $("mod-title").textContent = MOD_TITLES[name] || name;
  }

  function openSide() {
    $("sidebar")?.classList.add("is-open");
    if ($("sidebar-backdrop")) $("sidebar-backdrop").hidden = false;
  }
  function closeSide() {
    $("sidebar")?.classList.remove("is-open");
    if ($("sidebar-backdrop")) $("sidebar-backdrop").hidden = true;
  }

  function markUnavailable(modEl, msg) {
    if (!modEl) return;
    let banner = modEl.querySelector(".unavailable-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "unavailable-banner";
      modEl.insertBefore(banner, modEl.firstChild);
    }
    banner.textContent = msg || "غير متاح حتى يكتمل الربط";
    banner.hidden = false;
    modEl.querySelectorAll("form, button[type=submit], #btn-publish-panel, #btn-save-perms").forEach((el) => {
      el.setAttribute("data-disabled-by-api", "1");
      if ("disabled" in el) el.disabled = true;
      el.style.opacity = "0.45";
      el.style.pointerEvents = "none";
    });
  }
  function clearUnavailable(modEl) {
    if (!modEl) return;
    const banner = modEl.querySelector(".unavailable-banner");
    if (banner) banner.hidden = true;
    modEl.querySelectorAll('[data-disabled-by-api="1"]').forEach((el) => {
      el.removeAttribute("data-disabled-by-api");
      if ("disabled" in el) el.disabled = false;
      el.style.opacity = "";
      el.style.pointerEvents = "";
    });
  }

  function resetOverviewPlaceholders() {
    ["st-open", "st-claimed", "st-closed", "st-sla"].forEach((id) => {
      if ($(id)) $(id).textContent = "—";
    });
    if ($("ov-bot")) $("ov-bot").textContent = "—";
    if ($("ov-smart")) $("ov-smart").textContent = "—";
    if ($("ov-feed")) $("ov-feed").innerHTML = '<li class="muted">ما فيه نشاط بعد.</li>';
  }

  async function loadGuildModuleData(mod) {
    resetOverviewPlaceholders();
    if ($("tickets-body")) $("tickets-body").innerHTML = "";
    if ($("audit-list")) $("audit-list").innerHTML = "";

    // Settings (panel/roles/smart)
    try {
      const raw = await api(route("settings", guildId) || `/api/guilds/${guildId}/settings`);
      const settings = (raw && (raw.settings || raw.data || raw)) || null;
      if (settings) fillFormsFromApi(settings);
      clearUnavailable($("mod-panel"));
      clearUnavailable($("mod-roles"));
      clearUnavailable($("mod-smart"));
      if ($("ov-bot")) $("ov-bot").textContent = "متصل";
    } catch (e) {
      if (e.code !== "401" && e.code !== "403") {
        markUnavailable($("mod-panel"), "غير متاح حتى يكتمل الربط");
        markUnavailable($("mod-roles"), "غير متاح حتى يكتمل الربط");
        markUnavailable($("mod-smart"), "غير متاح حتى يكتمل الربط");
      }
    }

    if (mod === "tickets" || mod === "overview") {
      try {
        const t = await api(`/api/guilds/${guildId}/tickets`);
        const list = Array.isArray(t) ? t : t?.tickets || t?.data || [];
        lastTickets = list;
        renderTickets(list);
        if (mod === "overview") renderOverviewFromTickets(list);
        clearUnavailable($("mod-tickets"));
      } catch (e) {
        lastTickets = [];
        if ($("tickets-body"))
          $("tickets-body").innerHTML =
            '<tr><td colspan="7" class="muted">غير متاح حتى يكتمل الربط</td></tr>';
        if (e.code !== "401" && e.code !== "403") markUnavailable($("mod-tickets"), "غير متاح حتى يكتمل الربط");
        if (mod === "overview" && $("ov-feed"))
          $("ov-feed").innerHTML = '<li class="muted">غير متاح حتى يكتمل الربط</li>';
      }
    }

    if (mod === "logs") {
      try {
        const logs = await api(`/api/guilds/${guildId}/logs`);
        const list = Array.isArray(logs) ? logs : logs?.logs || logs?.data || [];
        renderLogs(list);
        clearUnavailable($("mod-logs"));
      } catch (e) {
        if ($("audit-list")) $("audit-list").innerHTML = '<li class="muted">غير متاح حتى يكتمل الربط</li>';
        if (e.code !== "401" && e.code !== "403") markUnavailable($("mod-logs"), "غير متاح حتى يكتمل الربط");
      }
    }

    if (mod === "overview") {
      try {
        const stats = await api(`/api/guilds/${guildId}/stats`);
        if (stats) {
          if ($("st-open")) $("st-open").textContent = stats.open ?? stats.openTickets ?? "—";
          if ($("st-claimed")) $("st-claimed").textContent = stats.claimed ?? stats.claimedTickets ?? "—";
          if ($("st-closed")) $("st-closed").textContent = stats.closedToday ?? stats.closed ?? "—";
          if ($("st-sla")) $("st-sla").textContent = stats.sla ?? stats.slaPercent ?? "—";
          if ($("ov-smart") && stats.smartEnabled != null)
            $("ov-smart").textContent = stats.smartEnabled ? "شغّال" : "مطفى";
        }
      } catch (_) {}
    }
  }

  function fillFormsFromApi(s) {
    const panel = s.panel || s.embed || {};
    if ($("cfg-title") && panel.title != null) $("cfg-title").value = panel.title;
    const color = panel.color || panel.embedColor;
    if (color && $("cfg-color")) {
      $("cfg-color").value = color;
      if ($("cfg-hex")) $("cfg-hex").value = color;
      updateGrad(color);
    }
    if ($("cfg-desc") && panel.desc != null) $("cfg-desc").value = panel.desc;
    if ($("cfg-welcome") && (panel.welcome != null || panel.welcomeText != null))
      $("cfg-welcome").value = panel.welcome || panel.welcomeText;
    if ($("cfg-channel")) $("cfg-channel").value = panel.channelId || panel.panelChannel || "";
    if ($("cfg-category")) $("cfg-category").value = panel.categoryId || panel.ticketCategory || "";
    const cats = panel.categories || s.categories;
    if (Array.isArray(cats)) renderCats(cats);

    const roles = s.roles || {};
    if ($("role-owner")) $("role-owner").value = roles.owner || roles.ownerRoleId || "";
    if ($("role-member")) $("role-member").value = roles.member || roles.memberRoleId || "";
    if ($("role-support")) $("role-support").value = roles.support || roles.supportRoleId || "";
    if ($("role-admin")) $("role-admin").value = roles.admin || roles.adminRoleId || "";

    const sm = s.smart || s.behavior || {};
    [
      ["sm-auto", sm.auto ?? sm.autoreply],
      ["sm-suggest", sm.suggest],
      ["sm-one", sm.one ?? sm.oneTicket],
      ["sm-idle", sm.idle ?? sm.idleWarn],
      ["sm-close", sm.close ?? sm.autoClose],
      ["sm-sla", sm.sla],
    ].forEach(([id, v]) => {
      if ($(id) && v != null) $(id).checked = !!v;
    });
    if ($("sm-idle-min") && (sm.idleMin || sm.idleWarnMin))
      $("sm-idle-min").value = sm.idleMin || sm.idleWarnMin;
    if ($("sm-close-min") && (sm.closeMin || sm.idleCloseMin))
      $("sm-close-min").value = sm.closeMin || sm.idleCloseMin;
    if ($("sm-sla-min") && (sm.slaMin || sm.slaTargetMin))
      $("sm-sla-min").value = sm.slaMin || sm.slaTargetMin;
    if ($("sm-prio") && sm.prio) $("sm-prio").value = sm.prio;

    if (s.perms) renderPerms(s.perms);
  }

  function updateGrad(c) {
    const el = $("grad-preview");
    if (el) el.style.background = `linear-gradient(135deg,#5B4DFF,${c},#A855F7)`;
  }

  function renderCats(cats) {
    const list = $("cat-list");
    if (!list) return;
    list._cats = (cats || []).map((c) => ({ ...c }));
    if (!list._cats.length) {
      list.innerHTML = '<li class="muted">ما فيه تصنيفات بعد.</li>';
      return;
    }
    list.innerHTML = list._cats
      .map(
        (c, i) => `<li class="cat-row">
        <input type="color" value="${esc(c.color || "#7C3AED")}" data-i="${i}" data-f="color" />
        <input type="text" value="${esc(c.name || "")}" data-i="${i}" data-f="name" />
        <input type="text" class="en" dir="ltr" value="${esc(c.key || "")}" data-i="${i}" data-f="key" />
        <button type="button" class="btn btn-ghost btn-sm" data-del="${i}">حذف</button>
      </li>`
      )
      .join("");
    list.querySelectorAll("input").forEach((inp) => {
      inp.onchange = () => {
        if (!list._cats[inp.dataset.i]) return;
        list._cats[inp.dataset.i][inp.dataset.f] = inp.value;
      };
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = () => {
        list._cats.splice(+btn.dataset.del, 1);
        renderCats(list._cats);
      };
    });
  }

  function renderPerms(perms) {
    const body = $("perm-body");
    if (!body) return;
    const items = [
      { id: "cmd_open", label: "/ticket فتح" },
      { id: "cmd_close", label: "/ticket إغلاق" },
      { id: "cmd_claim", label: "/ticket استلام" },
      { id: "btn_open", label: "زر فتح" },
      { id: "btn_close", label: "زر إغلاق" },
      { id: "btn_claim", label: "زر استلام" },
    ];
    const roles = ["everyone", "member", "support", "admin"];
    body.innerHTML = items
      .map((it) => {
        const row = (perms && perms[it.id]) || {};
        return `<tr><td>${it.label}</td>${roles
          .map(
            (r) =>
              `<td><input type="checkbox" data-perm="${it.id}" data-role="${r}" ${
                row[r] ? "checked" : ""
              }/></td>`
          )
          .join("")}</tr>`;
      })
      .join("");
  }

  function renderTickets(list) {
    const body = $("tickets-body");
    if (!body) return;
    const q = ($("ticket-q")?.value || "").trim().toLowerCase();
    const statusAr = { open: "مفتوحة", claimed: "مُستلمة", closed: "مغلقة" };
    const prioAr = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
    let rows = Array.isArray(list) ? list.slice() : [];
    rows = rows.filter((t) => {
      const st = t.status || t.state || "open";
      if (ticketFilter !== "all" && st !== ticketFilter) return false;
      if (!q) return true;
      return String(t.id || t.ticketId || "")
        .toLowerCase()
        .includes(q) || String(t.category || t.cat || "").includes(q);
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="muted">ما فيه تذاكر الحين.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((t) => {
        const id = t.id || t.ticketId || "—";
        const cat = t.category || t.cat || "—";
        const prio = t.priority || t.prio || "medium";
        const st = t.status || t.state || "open";
        const who = t.assignee || t.claimedBy || t.who || "—";
        const ago = t.ago || t.createdAt || "";
        return `<tr>
          <td class="en" dir="ltr">${esc(id)}</td><td>${esc(cat)}</td>
          <td><span class="prio ${esc(prio)}">${prioAr[prio] || esc(prio)}</span></td>
          <td><span class="status-chip ${esc(st)}">${statusAr[st] || esc(st)}</span></td>
          <td>${esc(who)}</td><td>${esc(ago)}</td><td></td></tr>`;
      })
      .join("");
  }

  function renderOverviewFromTickets(list) {
    if (!Array.isArray(list) || !list.length) return;
    const open = list.filter((t) => (t.status || t.state) === "open").length;
    const claimed = list.filter((t) => (t.status || t.state) === "claimed").length;
    const closed = list.filter((t) => (t.status || t.state) === "closed").length;
    if ($("st-open")) $("st-open").textContent = String(open);
    if ($("st-claimed")) $("st-claimed").textContent = String(claimed);
    if ($("st-closed")) $("st-closed").textContent = String(closed);
    if ($("ov-feed")) {
      $("ov-feed").innerHTML = list
        .slice(0, 5)
        .map((t) => {
          const id = t.id || t.ticketId || "";
          const cat = t.category || t.cat || "";
          return `<li><span class="dot"></span><span>${esc(id)} — ${esc(cat)}</span></li>`;
        })
        .join("");
    }
  }

  function renderLogs(list) {
    const el = $("audit-list");
    if (!el) return;
    if (!list || !list.length) {
      el.innerHTML = '<li class="muted">ما فيه سجلات بعد.</li>';
      return;
    }
    el.innerHTML = list
      .map((a) => {
        const type = a.type || a.action || "log";
        const text = a.text || a.message || a.summary || "";
        const at = a.at || a.createdAt || a.timestamp || "";
        return `<li><span class="audit-badge">${esc(type)}</span><span>${esc(text)}</span><time>${esc(at)}</time></li>`;
      })
      .join("");
  }

  function collectPanelPayload() {
    const list = $("cat-list");
    return {
      title: $("cfg-title")?.value.trim() || "",
      color: $("cfg-hex")?.value.trim() || "#7C3AED",
      desc: $("cfg-desc")?.value.trim() || "",
      welcome: $("cfg-welcome")?.value.trim() || "",
      channelId: $("cfg-channel")?.value.trim() || "",
      categoryId: $("cfg-category")?.value.trim() || "",
      categories: (list && list._cats) || [],
    };
  }
  function collectRolesPayload() {
    return {
      owner: $("role-owner")?.value.trim() || "",
      member: $("role-member")?.value.trim() || "",
      support: $("role-support")?.value.trim() || "",
      admin: $("role-admin")?.value.trim() || "",
    };
  }
  function collectSmartPayload() {
    return {
      auto: !!$("sm-auto")?.checked,
      suggest: !!$("sm-suggest")?.checked,
      one: !!$("sm-one")?.checked,
      idle: !!$("sm-idle")?.checked,
      close: !!$("sm-close")?.checked,
      sla: !!$("sm-sla")?.checked,
      idleMin: +($("sm-idle-min")?.value || 30),
      closeMin: +($("sm-close-min")?.value || 120),
      slaMin: +($("sm-sla-min")?.value || 15),
      prio: $("sm-prio")?.value || "medium",
    };
  }
  function collectPermsPayload() {
    const perms = {};
    $$("#perm-body input").forEach((cb) => {
      if (!perms[cb.dataset.perm]) perms[cb.dataset.perm] = {};
      perms[cb.dataset.perm][cb.dataset.role] = cb.checked;
    });
    return perms;
  }

  /** Must succeed on API — never toast success for local-only */
  async function saveSettings(section, partial) {
    if (!guildId) {
      toast("لا يوجد سيرفر محدد");
      return false;
    }
    if (!apiBase()) {
      toast("الخدمة مو متاحة");
      return false;
    }
    try {
      await api(route("settings", guildId) || `/api/guilds/${guildId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ section, settings: partial }),
      });
      toast("تم الحفظ");
      return true;
    } catch (e) {
      if (e.code === "UNAVAILABLE") toast("غير متاح حتى يكتمل الربط");
      else if (e.code !== "401" && e.code !== "403") toast("ما انحفظ — الخادم ما أكّد");
      return false;
    }
  }

  async function publishPanel() {
    if (!guildId || !apiBase()) {
      toast("الخدمة مو متاحة");
      return;
    }
    const panel = collectPanelPayload();
    try {
      await api(route("settings", guildId) || `/api/guilds/${guildId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ section: "panel", settings: { panel } }),
      });
      await api(route("panel", guildId) || `/api/guilds/${guildId}/panel`, {
        method: "POST",
        body: JSON.stringify(panel),
      });
      toast("تم نشر المنبر");
    } catch (e) {
      if (e.code === "UNAVAILABLE") toast("غير متاح حتى يكتمل الربط");
      else if (e.code !== "401" && e.code !== "403") toast("ما نُشر — الخادم ما أكّد");
    }
  }

  function bind() {
    window.addEventListener("hashchange", applyRoute);

    $$("[data-invite]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        inviteBot();
      })
    );

    $("btn-discord-login")?.addEventListener("click", loginDiscord);
    $("btn-hero-login")?.addEventListener("click", loginDiscord);
    $("btn-nav-login")?.addEventListener("click", loginDiscord);
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-logout-side")?.addEventListener("click", logout);
    $("btn-invite-global")?.addEventListener("click", inviteBot);
    $("btn-side-open")?.addEventListener("click", openSide);
    $("sidebar-backdrop")?.addEventListener("click", closeSide);
    $("btn-retry-guilds")?.addEventListener("click", () => loadAndRenderGuilds());

    $$(".btn[data-mod]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!guildId) return;
        go(`#/g/${guildId}/${a.dataset.mod}`);
      });
    });

    $("cfg-color")?.addEventListener("input", (e) => {
      if ($("cfg-hex")) $("cfg-hex").value = e.target.value;
      updateGrad(e.target.value);
    });
    $("cfg-hex")?.addEventListener("change", (e) => {
      let v = e.target.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        if ($("cfg-color")) $("cfg-color").value = v;
        updateGrad(v);
      }
    });

    $("form-panel")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettings("panel", { panel: collectPanelPayload() });
    });
    $("btn-publish-panel")?.addEventListener("click", publishPanel);
    $("btn-add-cat")?.addEventListener("click", () => {
      const list = $("cat-list");
      const cats = (list && list._cats) || [];
      cats.push({ name: "تصنيف جديد", key: "new", color: "#A855F7" });
      renderCats(cats);
    });

    $("form-roles")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettings("roles", { roles: collectRolesPayload() });
    });
    $("btn-save-perms")?.addEventListener("click", async () => {
      await saveSettings("perms", { perms: collectPermsPayload() });
    });
    $("form-smart")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettings("smart", { smart: collectSmartPayload() });
    });

    $("ticket-filters")?.querySelectorAll("button[data-f], .chip-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("ticket-filters")
          .querySelectorAll("button[data-f], .chip-btn")
          .forEach((b) => b.classList.remove("is-on", "is-active"));
        btn.classList.add("is-on");
        ticketFilter = btn.dataset.f || "all";
        renderTickets(lastTickets);
      });
    });
    $("ticket-q")?.addEventListener("input", () => renderTickets(lastTickets));
    $("btn-refresh-logs")?.addEventListener("click", () => loadGuildModuleData("logs"));

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

  // OAuth error bounce from API
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("error")) {
      toast("ما تم الدخول. حاول مرة ثانية.");
      history.replaceState({}, "", location.pathname + location.hash);
    }
  } catch (_) {}
  bind();
  restoreSession();
})();
