# Ops

لوحة تحكم عربية (RTL) لبوت تذاكر ديسكورد الذكي.

**Live:** https://gaber311a-lang.github.io/ops/

**Bot repo:** https://github.com/gaber311a-lang/discord-ticket-bot

## Local

```bash
python3 -m http.server 8080
```

افتح `http://localhost:8080` — أي رمز من 4 أرقام للدخول التجريبي.

## Stack

- `index.html` — لوحة التحكم (SPA)
- `styles.css` — ثيم بنفسجي داكن / زجاجي
- `app.js` — تنقّل، حفظ محلي (localStorage)، بيانات تجريبية
- `.nojekyll` — GitHub Pages

الإعدادات تُحفظ في المتصفح فقط حتى يربط Eng الـ API.
