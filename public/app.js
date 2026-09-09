/* Frangipani, Poliert — Phở Restaurant Konstanz
   Scroll reveals + mobile nav. Dependency-free, reduced-motion aware. */
(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Mobile nav ---------- */
  var toggle = document.getElementById("navToggle");
  var navList = document.getElementById("navList");
  if (toggle && navList) {
    toggle.addEventListener("click", function () {
      var open = navList.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // close the menu after choosing a section
    navList.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navList.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Scroll reveals with sibling stagger ---------- */
  var io = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var parent = el.parentElement;
        if (parent) {
          var siblings = Array.prototype.filter.call(parent.children, function (c) {
            return c.classList && c.classList.contains("reveal");
          });
          var idx = siblings.indexOf(el);
          if (idx > 0) el.style.setProperty("--reveal-delay", Math.min(idx * 90, 450) + "ms");
        }
        el.classList.add("is-visible");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
  }

  /* Observe every not-yet-visible .reveal under root. Dynamically inserted
     .reveal nodes (menu.js) MUST be passed through here, or they stay hidden. */
  function observeReveals(root) {
    var els = (root || document).querySelectorAll(".reveal:not(.is-visible)");
    Array.prototype.forEach.call(els, function (el) {
      if (io) io.observe(el);
      else el.classList.add("is-visible");
    });
  }

  window.PHO = window.PHO || {};
  window.PHO.observeReveals = observeReveals;

  observeReveals(document);
})();
