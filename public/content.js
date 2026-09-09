/* Phở Restaurant Konstanz — owner-editable static text.
   Loads content.json and overrides the baked-in text of the core sections
   (hero, philosophy, evening teaser, contact/address, Impressum, tagline).
   Runs AFTER i18n.js, so on every language switch it re-applies on top of
   i18n's markup and wins. On fetch failure the baked German/English remains
   (graceful, SEO-safe). Mirrors menu.js. Requires HTTP serving (fetch). */
(function () {
  "use strict";

  var DATA = null;

  function lang() {
    return (window.PHO && window.PHO.getLang && window.PHO.getLang()) || "de";
  }

  /* Localized value: plain strings pass through, {de,en} objects pick lang. */
  function loc(v, l) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v[l] != null ? v[l] : (v.de || "");
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* Set textContent of the element carrying a given data-i18n key. */
  function setText(key, value) {
    var el = document.querySelector('[data-i18n="' + key + '"]');
    if (el) el.textContent = value;
  }

  /* Set innerHTML of the element carrying a given data-i18n key. */
  function setHtml(key, html) {
    var el = document.querySelector('[data-i18n="' + key + '"]');
    if (el) el.innerHTML = html;
  }

  function telLink(contact, label) {
    return '<a href="tel:' + esc(contact.phoneHref) + '">' + esc(label) + "</a>";
  }

  var LABELS = {
    de: { phone: "Telefon:", owner: "Inhaber", vat: "Ust-Id:" },
    en: { phone: "Phone:", owner: "Owner", vat: "VAT ID:" },
  };

  function render(l) {
    if (!DATA) return;
    var c = DATA;
    var contact = c.contact || {};
    var star = '<span class="star" aria-hidden="true">★</span> ';

    // Brand tagline (header + footer)
    if (c.brand) {
      setHtml("brand.sub", star + esc(loc(c.brand.tagline, l)));
      setHtml("footer.line", star + esc(loc(c.brand.tagline, l)));
    }

    // Hero
    if (c.hero) {
      setText("hero.eyebrow", loc(c.hero.eyebrow, l));
      setText("hero.title", loc(c.hero.title, l));
      setText("hero.lead", loc(c.hero.lead, l));
      setText("hero.ctaReserve", loc(c.hero.ctaReserve, l));
      setText("hero.ctaHours", loc(c.hero.ctaHours, l));
    }

    // Philosophy
    if (c.philosophy) {
      var p = c.philosophy;
      setText("phil.quote", loc(p.quote, l));
      setText("phil.copy1", loc(p.copy1, l));
      setText("phil.copy2", loc(p.copy2, l));
      setText("phil.explainerBody", loc(p.explainerBody, l));
      setHtml(
        "phil.explainerTitle",
        "<em>phở</em> <span class=\"pron\">" + esc(loc(p.pron, l)) + "</span>",
      );
    }

    // Evening teaser
    if (c.evening) {
      setText("evening.title", loc(c.evening.title, l));
      setText("evening.lead", loc(c.evening.lead, l));
      setText("evening.copy", loc(c.evening.copy, l));
      setText("evening.hours", loc(c.evening.hoursLine, l));
    }

    // Contact section labels
    if (c.contactSection) {
      var cs = c.contactSection;
      setText("contact.title", loc(cs.title, l));
      setText("contact.sub", loc(cs.sub, l));
      setText("contact.addressLabel", loc(cs.addressLabel, l));
      setText("contact.phoneLabel", loc(cs.phoneLabel, l));
      setText("contact.hint", loc(cs.hint, l));
      setText("contact.hoursLabel", loc(cs.hoursLabel, l));
    }

    // Canonical contact → hero note, footer copy, contact address/phone
    var addrParts = [contact.street, contact.city].filter(Boolean).map(esc).join(" · ");
    setHtml("hero.note", addrParts + " · " + telLink(contact, contact.phoneShort));
    setHtml(
      "footer.copy",
      esc(contact.name) + " · " + addrParts + " · " + telLink(contact, contact.phoneShort),
    );
    var addrEl = document.getElementById("contactAddress");
    if (addrEl) {
      addrEl.innerHTML =
        esc(contact.name) + "<br>" + esc(contact.street) + "<br>" + esc(contact.city);
    }
    var telEl = document.getElementById("contactTel");
    if (telEl) {
      telEl.textContent = contact.phoneDisplay || "";
      if (contact.phoneHref) telEl.setAttribute("href", "tel:" + contact.phoneHref);
    }

    // Impressum
    if (c.impressum) {
      var im = c.impressum;
      var lb = LABELS[l] || LABELS.de;
      setText("imprint.title", loc(im.title, l));
      setHtml(
        "imprint.block1",
        "<p><strong>" + esc(contact.name) + "</strong><br>" +
          esc(contact.street) + "<br>" + esc(contact.city) + "<br>" +
          lb.phone + " " + esc(contact.phoneDisplay) + "</p>" +
          "<p><strong>" + lb.owner + "</strong><br>" +
          esc(im.owner) + "<br>" + lb.vat + " " + esc(im.vatId) + "</p>",
      );
      var legal = (im.legal || [])
        .map(function (item) {
          return (
            "<p><strong>" + esc(loc(item.heading, l)) + "</strong><br>" +
            esc(loc(item.text, l)) + "</p>"
          );
        })
        .join("");
      setHtml("imprint.block2", legal);
    }
  }

  fetch("./content.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("content.json " + res.status);
      return res.json();
    })
    .then(function (data) {
      DATA = data;
      render(lang());
      document.addEventListener("pho:lang", function (e) {
        render(e.detail.lang);
      });
    })
    .catch(function (err) {
      console.warn("content.json not loaded — keeping baked text:", err);
    });
})();
