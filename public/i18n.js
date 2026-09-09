/* Phở Restaurant Konstanz — DE/EN language toggle.
   German is the source of truth and lives in the static HTML (crawlable,
   no-JS fallback). English strings for the static copy live below; menu
   content is translated in menu.json and re-rendered by menu.js.
   Note: this is a client-side toggle on a single URL — no hreflang. If real
   EN indexing is ever wanted, that's a ?lang=en / /en/ follow-up. */
(function () {
  "use strict";

  var STORAGE_KEY = "pho.lang";

  /* EN strings for [data-i18n] elements. Values are innerHTML (may contain
     markup mirroring the German original). Keys missing here stay German. */
  var EN = {
    "brand.sub": '<span class="star" aria-hidden="true">★</span> Specialties from Vietnam',
    "nav.restaurant": "Restaurant",
    "nav.lunch": "Lunch menu",
    "nav.dinner": "Evening menu",
    "nav.contact": "Contact",
    "nav.imprint": "Imprint",

    "hero.eyebrow": "Restaurant · Konstanz",
    "hero.title": "Welcome to Restaurant&nbsp;Phở",
    "hero.lead": "We serve you specialties from Vietnam — as a lunch menu and on our evening menu.",
    "hero.ctaLunch": "Lunch menu",
    "hero.ctaReserve": "Reserve a table",
    "hero.ctaHours": "Opening hours",
    "hero.note": 'Hindenburgstraße 15 · 78467 Konstanz · <a href="tel:+4975316970555">07531 / 697 05 55</a>',

    "phil.quote": "“In Vietnam you don’t have to search for food, it&nbsp;searches&nbsp;for&nbsp;you.”",
    "phil.copy1": "Food in Vietnam is much more than mere nourishment — it is a high art of living. Vietnamese cuisine is therefore among the most diverse, lightest and healthiest in the world. Its cornerstones are rice, the fish sauce “nườc mắm” and fresh herbs.",
    "phil.copy2": "We always cook with fresh ingredients. Fats are used only sparingly.",
    "phil.explainerTitle": '<em>phở</em> <span class="pron">(pronounced “fo”)</span>',
    "phil.explainerBody": "… is a traditional soup and the national dish of Vietnam. It is available at almost every street corner and is eaten for breakfast, but also for lunch and dinner. The soup is served in a bowl and, besides a rich broth, contains rice noodles and thinly sliced beef or chicken. It can be seasoned to taste with fresh herbs and fish sauce.",

    "lunch.title": "Lunch menu",

    "evening.title": "Evening menu",
    "evening.lead": "From 6 pm we welcome you to our restaurant and invite you on a small culinary journey through our country, from north to south.",
    "evening.copy": "All dishes are homemade and always prepared with fresh ingredients.",
    "evening.hours": "Monday – Saturday · 6 – 10.30 pm · kitchen open until 10 pm",
    "evening.reserve": "Reserve a table",

    "reserve.title": "Reserve a table",
    "reserve.intro": "Send us your request — we will confirm it by phone. Fields marked * are required.",
    "reserve.name": "Name *",
    "reserve.phone": "Phone *",
    "reserve.email": "Email *",
    "reserve.date": "Date *",
    "reserve.time": "Time *",
    "reserve.guests": "Guests *",
    "reserve.message": "Note (optional)",
    "reserve.cancel": "Cancel",
    "reserve.submit": "Send request",

    "contact.title": "Contact",
    "contact.sub": "We look forward to seeing you!",
    "contact.addressLabel": "Address",
    "contact.phoneLabel": "Phone",
    "contact.hint": "We are happy to take reservations and takeaway orders by phone.",
    "contact.hoursLabel": "Opening hours",

    "imprint.title": "Imprint",
    "imprint.block1": "<p><strong>Phở Restaurant</strong><br>Hindenburgstraße 15<br>78467 Konstanz<br>Phone: 0049&nbsp;(0)7531 / 697 05 55</p><p><strong>Owner</strong><br>Luong Tam Giang<br>VAT ID: DE299264201</p>",
    "imprint.block2": "<p><strong>Rights of use</strong><br>All texts, photos and design elements of this website are protected by copyright unless another copyright is indicated.</p><p><strong>Note pursuant to the German Teleservices Act</strong><br>The webmaster of these pages points out that links lead to external providers as soon as this site is left, unless expressly stated otherwise. The respective authors are responsible for the content of linked pages; the webmaster assumes no responsibility for the accuracy or currency of their content.</p>",

    "footer.line": '<span class="star" aria-hidden="true">★</span> Specialties from Vietnam',
    "footer.copy": 'Phở Restaurant · Hindenburgstraße 15 · 78467 Konstanz · <a href="tel:+4975316970555">07531 / 697 05 55</a>',
    "footer.toTop": "Back to top ↑"
  };

  /* Attribute-level translations, handled explicitly (only a handful). */
  var META = {
    title: {
      de: null, // snapshotted at init
      en: "Phở Restaurant Konstanz | Welcome"
    },
    description: {
      de: null,
      en: "Phở Restaurant Konstanz – specialties from Vietnam as a lunch menu and on the evening menu. Hindenburgstraße 15, 78467 Konstanz."
    },
    eveningAlt: {
      de: null,
      en: "Evening atmosphere in the restaurant: dark wood, set tables and warm lamplight"
    },
    navAria: { de: null, en: "Main navigation" },
    navToggle: { de: null, en: "Menu" }
  };

  var germanSnapshot = new Map();
  var current = "de";

  function snapshotGerman() {
    var els = document.querySelectorAll("[data-i18n]");
    Array.prototype.forEach.call(els, function (el) {
      germanSnapshot.set(el.getAttribute("data-i18n"), el.innerHTML);
    });
    META.title.de = document.title;
    var desc = document.querySelector('meta[name="description"]');
    META.description.de = desc ? desc.getAttribute("content") : "";
    var img = document.querySelector("[data-i18n-alt]");
    META.eveningAlt.de = img ? img.getAttribute("alt") : "";
    var nav = document.querySelector(".site-nav");
    META.navAria.de = nav ? nav.getAttribute("aria-label") : "";
    var navToggle = document.getElementById("navToggle");
    META.navToggle.de = navToggle ? navToggle.getAttribute("aria-label") : "";
  }

  /* Only the active language's PDF download is shown (no-JS keeps both). */
  function syncPdfLinks(lang) {
    var links = document.querySelectorAll("[data-pdf-lang]");
    Array.prototype.forEach.call(links, function (a) {
      a.hidden = a.getAttribute("data-pdf-lang") !== lang;
    });
  }

  function applyLang(lang) {
    var els = document.querySelectorAll("[data-i18n]");
    Array.prototype.forEach.call(els, function (el) {
      var key = el.getAttribute("data-i18n");
      var html = lang === "en" ? EN[key] : germanSnapshot.get(key);
      if (html != null) el.innerHTML = html;
    });

    document.documentElement.lang = lang;
    document.title = META.title[lang] || META.title.de;
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", META.description[lang] || META.description.de);
    var img = document.querySelector("[data-i18n-alt]");
    if (img) img.setAttribute("alt", META.eveningAlt[lang] || META.eveningAlt.de);
    var nav = document.querySelector(".site-nav");
    if (nav) nav.setAttribute("aria-label", META.navAria[lang] || META.navAria.de);
    var navToggle = document.getElementById("navToggle");
    if (navToggle) navToggle.setAttribute("aria-label", META.navToggle[lang] || META.navToggle.de);

    var buttons = document.querySelectorAll(".lang-switch [data-lang]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });

    syncPdfLinks(lang);
  }

  function setLang(lang, opts) {
    if (lang !== "de" && lang !== "en") lang = "de";
    if (lang === current && !(opts && opts.force)) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode */ }
    applyLang(lang);
    document.dispatchEvent(new CustomEvent("pho:lang", { detail: { lang: lang } }));
  }

  function getLang() {
    return current;
  }

  snapshotGerman();
  syncPdfLinks(current); // initial state (default de) before any toggle

  var buttons = document.querySelectorAll(".lang-switch [data-lang]");
  Array.prototype.forEach.call(buttons, function (btn) {
    btn.addEventListener("click", function () {
      setLang(btn.getAttribute("data-lang"));
    });
  });

  window.PHO = window.PHO || {};
  window.PHO.setLang = setLang;
  window.PHO.getLang = getLang;

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* private mode */ }
  if (saved === "en") setLang("en", { force: true });
})();
