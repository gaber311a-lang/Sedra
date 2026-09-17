# Ops

لوحة تحكم عربية (RTL) لبوت تذاكر ديسكورد.

**Live:** https://gaber311a-lang.github.io/ops/

## الشاشات

| Hash | الشاشة |
|------|--------|
| `#/` | الصفحة الرئيسية |
| `#/login` | دخول ديسكورد |
| `#/servers` | سيرفراتك |
| `#/g/:id/overview` | نظرة عامة |
| `#/g/:id/tickets` | التذاكر |
| `#/g/:id/panel` | المنبر |
| `#/g/:id/roles` | الرتب والصلاحيات |
| `#/g/:id/smart` | سلوك التذاكر |
| `#/g/:id/logs` | السجل |

## الربط (Railway)

```js
window.OPS_API_BASE = "https://ticket-ops-api-production.up.railway.app";
```

أضف Redirect URI في Discord Portal:
`https://ticket-ops-api-production.up.railway.app/auth/discord/callback`

تعديل الإعدادات لصاحب السيرفر فقط. أزرار العلامة بنفسجية؛ أزرق ديسكورد لزر الدخول والدعوة فقط.
