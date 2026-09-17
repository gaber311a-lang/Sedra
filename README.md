# Ops

لوحة تحكم عربية (RTL) متعددة الشاشات لبوت تذاكر ديسكورد — طراز ProBot، بنفسجي متدرج.

**Live:** https://gaber311a-lang.github.io/ops/

## شاشات منفصلة (hash)

| Hash | الشاشة |
|------|--------|
| `#/` | هبوط تسويقي فقط |
| `#/login` | دخول Discord |
| `#/servers` | شبكة السيرفرات |
| `#/g/:id/overview` | نظرة عامة |
| `#/g/:id/tickets` | التذاكر |
| `#/g/:id/panel` | المنبر + نشر |
| `#/g/:id/roles` | الرتب والصلاحيات |
| `#/g/:id/smart` | الإعدادات الذكية |
| `#/g/:id/logs` | السجل |

## API (Railway)

```js
window.OPS_API_BASE = "https://ticket-ops-api-production.up.railway.app";
```

- Login → `/auth/discord`
- Invite → `/invite`
- Guilds/settings/panel → `/api/guilds...`

**جابر:** أضف Redirect URI في Discord Portal:
`https://ticket-ops-api-production.up.railway.app/auth/discord/callback`

الأونر فقط يعدّل الإعدادات. أزرار العلامة التجارية بنفسجية متدرجة؛ أزرق Discord لزر الدخول/الدعوة فقط.
