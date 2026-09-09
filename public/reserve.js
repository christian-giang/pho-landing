/* Phở Restaurant Konstanz — reservation modal.
   Opens a <dialog> from the "Tisch reservieren" button, validates, and POSTs
   to /api/reserve (the serverless email endpoint). Progressive enhancement:
   with no JS the button falls back to jumping to #kontakt (the phone number).
   JS-side strings live in DICT (i18n.js only translates static [data-i18n]
   markup); the active language comes from window.PHO.getLang(). */
(function () {
  "use strict";

  var dialog = document.getElementById("reserveDialog");
  var trigger = document.getElementById("reserveBtn");
  var form = document.getElementById("reserveForm");
  if (!dialog || !trigger || !form) return;

  var statusEl = document.getElementById("reserveStatus");
  var submitBtn = document.getElementById("reserveSubmit");
  var closeBtn = document.getElementById("reserveClose");
  var cancelBtn = document.getElementById("reserveCancel");
  var lastFocused = null;

  var DICT = {
    close: { de: "Schließen", en: "Close" },
    required: { de: "Bitte füllen Sie alle Pflichtfelder aus.", en: "Please fill in all required fields." },
    email: { de: "Bitte geben Sie eine gültige E-Mail-Adresse ein.", en: "Please enter a valid email address." },
    past: { de: "Bitte wählen Sie ein Datum in der Zukunft.", en: "Please choose a date in the future." },
    sending: { de: "Wird gesendet …", en: "Sending …" },
    success: {
      de: "Vielen Dank! Ihre Anfrage ist eingegangen – wir melden uns telefonisch.",
      en: "Thank you! We received your request and will confirm by phone."
    },
    error: { de: "Senden fehlgeschlagen. Bitte rufen Sie uns an.", en: "Sending failed. Please call us." },
    rate: { de: "Zu viele Anfragen. Bitte später erneut versuchen.", en: "Too many requests. Please try again later." },
    unavailable: {
      de: "Reservierungen sind derzeit nicht verfügbar. Bitte rufen Sie uns an.",
      en: "Reservations are currently unavailable. Please call us."
    }
  };

  function lang() {
    return (window.PHO && window.PHO.getLang && window.PHO.getLang()) || "de";
  }
  function t(key) {
    var e = DICT[key];
    return e ? e[lang()] || e.de : "";
  }

  function applyDynamicText() {
    if (closeBtn) closeBtn.setAttribute("aria-label", t("close"));
    if (submitBtn && !submitBtn.disabled) {
      // static submit label is handled by data-i18n; nothing to do here
    }
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.className = "reserve-status";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.className = "reserve-status is-" + (kind || "info");
  }

  function todayStr() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function open() {
    lastFocused = document.activeElement;
    setStatus("");
    var dateInput = form.elements.date;
    if (dateInput) dateInput.min = todayStr();
    applyDynamicText();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    var first = form.elements.name;
    if (first) first.focus();
  }

  function close() {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  trigger.addEventListener("click", function (e) {
    e.preventDefault();
    open();
  });
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (cancelBtn) cancelBtn.addEventListener("click", close);

  // Click on the backdrop (outside the form) closes the dialog.
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) close();
  });
  // Native dialog fires "cancel" on Escape; keep focus restore consistent.
  dialog.addEventListener("cancel", function () {
    if (lastFocused && lastFocused.focus) setTimeout(function () { lastFocused.focus(); }, 0);
  });

  function endpoint() {
    return "/api/reserve";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitBtn && submitBtn.disabled) return;

    var f = form.elements;
    var data = {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      email: f.email.value.trim(),
      date: f.date.value,
      time: f.time.value,
      guests: parseInt(f.guests.value, 10),
      message: f.message.value.trim(),
      lang: lang(),
      company: f.company ? f.company.value : ""
    };

    if (!data.name || !data.phone || !data.email || !data.date || !data.time || !data.guests) {
      setStatus(t("required"), "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setStatus(t("email"), "error");
      return;
    }
    if (data.date < todayStr()) {
      setStatus(t("past"), "error");
      return;
    }

    submitBtn.disabled = true;
    setStatus(t("sending"), "info");

    fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, ok: res.ok && body && body.ok, body: body };
        });
      })
      .then(function (r) {
        if (r.ok) {
          form.reset();
          setStatus(t("success"), "success");
          submitBtn.disabled = false;
        } else if (r.status === 429) {
          setStatus(t("rate"), "error");
          submitBtn.disabled = false;
        } else if (r.status === 503) {
          setStatus(t("unavailable"), "error");
          submitBtn.disabled = false;
        } else {
          setStatus(t("error"), "error");
          submitBtn.disabled = false;
        }
      })
      .catch(function () {
        setStatus(t("error"), "error");
        submitBtn.disabled = false;
      });
  });

  // Re-translate dynamic bits (and any shown status) on language switch.
  document.addEventListener("pho:lang", function () {
    applyDynamicText();
    // Refresh a visible status message in the new language if it maps to a key.
    if (statusEl && !statusEl.hidden) {
      var cls = statusEl.className;
      for (var key in DICT) {
        if (statusEl.textContent === DICT[key].de || statusEl.textContent === DICT[key].en) {
          statusEl.textContent = t(key);
          break;
        }
      }
      statusEl.className = cls;
    }
  });

  applyDynamicText();
})();
