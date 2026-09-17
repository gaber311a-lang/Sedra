/* Ops frontend — Eng fills OPS_API_BASE when backend is live.
   Bot token / CLIENT_SECRET must NEVER appear here or in the browser. */
window.OPS_API_BASE = "https://ticket-ops-api-production.up.railway.app";

window.OPS_CONFIG = {
  get API_BASE() {
    return String(window.OPS_API_BASE || "").replace(/\/$/, "");
  },
  DISCORD_CLIENT_ID: "",
  OWNER_ONLY: true,
  BOT_PERMISSIONS: "2147609616",
  routes: {
    health: "/health",
    invite: "/invite",
    login: "/auth/discord",
    callback: "/auth/discord/callback",
    me: "/auth/me",
    logout: "/auth/logout",
    guilds: "/api/guilds",
    settings: "/api/guilds/:guildId/settings",
    panel: "/api/guilds/:guildId/panel",
  },
  inviteUrl(clientId) {
    const id = clientId || this.DISCORD_CLIENT_ID || "CLIENT_ID";
    return (
      "https://discord.com/api/oauth2/authorize?client_id=" +
      encodeURIComponent(id) +
      "&permissions=2147609616&scope=bot%20applications.commands"
    );
  },
  LIVE_URL: "https://gaber311a-lang.github.io/ops/",
  BOT_REPO: "https://github.com/gaber311a-lang/discord-ticket-bot",
};
