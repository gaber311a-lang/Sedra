(() => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#site-nav");
  const form = document.querySelector("#order-form");
  const status = document.querySelector("#form-status");
  const waLink = document.querySelector("#whatsapp-link");
  const WA_BASE = "https://wa.me/966500000000";

  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-label", open ? "إغلاق القائمة" : "القائمة");
    };
    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  function buildWaUrl(name, phone, product, message) {
    const lines = [
      "مرحباً، أرغب بالطلب من سدرة:",
      name ? `الاسم: ${name}` : null,
      phone ? `الجوال: ${phone}` : null,
      product ? `المنتج: ${product}` : null,
      message ? `التفاصيل: ${message}` : null,
    ].filter(Boolean);
    return `${WA_BASE}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  function syncWhatsApp() {
    if (!waLink || !form) return;
    waLink.href = buildWaUrl(
      form.name.value.trim(),
      form.phone.value.trim(),
      form.interest.value,
      form.message.value.trim()
    );
  }

  if (form && status) {
    ["input", "change"].forEach((evt) => form.addEventListener(evt, syncWhatsApp));
    syncWhatsApp();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.name.value.trim();
      const phone = form.phone.value.trim();
      const product = form.interest.value;
      const message = form.message.value.trim();
      if (!name || !phone) {
        status.textContent = "يرجى إدخال الاسم والجوال.";
        status.classList.remove("is-success");
        return;
      }
      if (waLink) waLink.href = buildWaUrl(name, phone, product, message);
      status.textContent = "شكراً لك — يمكنك الإرسال عبر واتساب أو سنعود إليك قريباً.";
      status.classList.add("is-success");
      form.reset();
      syncWhatsApp();
    });
  }
})();
