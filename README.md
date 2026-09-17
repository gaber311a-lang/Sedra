# Ops

لوحة تحكم عربية (RTL) متعددة السيرفرات لبوت تذاكر ديسكورد — طراز ProBot، بنفسجي متدرج.

**Live:** https://gaber311a-lang.github.io/ops/

## صلاحيات

**الأونر فقط** يقدر يعدّل إعدادات السيرفر (ليس Admin / Manage Guild).

## Frontend

`config.js`:

```js
window.OPS_API_BASE = "https://aviation-board-charlie-hopefully.trycloudflare.com";
```

Login CTA → `${OPS_API_BASE}/auth/discord`

### Eng API contract

| Method | Path |
|--------|------|
| GET | `/health` `/invite` `/auth/discord` `/auth/discord/callback` `/auth/me` |
| POST | `/auth/logout` |
| GET | `/api/guilds` |
| GET/PUT | `/api/guilds/:guildId/settings` |
| POST | `/api/guilds/:guildId/panel` |

Invite: `permissions=2147609616` · `scope=bot applications.commands`

CORS يسمح بـ `*.github.io/ops`. Owner-only على settings.
