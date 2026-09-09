/* Phở Restaurant Konstanz — renders Mittagsmenü, Abendkarte, Getränke and
   Öffnungszeiten from menu.json (the owner-editable source of truth).
   Requires HTTP serving (fetch fails on file://). On any failure the static
   German markup in index.html stays as-is and the dinner card remains hidden
   — the page is complete, just without the full evening menu.
   NOTE: the static lunch/hours markup in index.html is a fallback only and
   may drift from menu.json; menu.json wins whenever it loads. */
(function () {
  "use strict";

  var DATA = null;
  /* The dinner menu shows ONE category at a time; the pills select which.
     Categories with several titled subcategories (Hauptspeisen) additionally
     show ONE subcategory at a time via a second pill row. Both selections
     survive language re-renders. */
  var activePanel = null;
  var activeSubs = {}; // category id -> active subcategory index
  var jumpWired = false;
  var subJumpWired = false;

  function panelIds() {
    var ids = DATA.dinner.categories.map(function (c) { return c.id; });
    ids.push("getraenke");
    return ids;
  }

  function hasSubPanels(cat) {
    return (
      cat.subcategories &&
      cat.subcategories.length > 1 &&
      cat.subcategories.every(function (s) { return !!s.title; })
    );
  }

  /* Scroll a pill row so the active pill sits centered — makes it obvious the
     row can be swiped and keeps the selection in view. */
  function centerPill(nav, btn) {
    if (!nav || !btn) return;
    var max = nav.scrollWidth - nav.clientWidth;
    if (max <= 0) return; // row fits — nothing to scroll
    var navRect = nav.getBoundingClientRect();
    var btnRect = btn.getBoundingClientRect();
    var target = nav.scrollLeft + (btnRect.left - navRect.left) - (nav.clientWidth - btnRect.width) / 2;
    target = Math.max(0, Math.min(target, max));
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      nav.scrollTo({ left: target, behavior: reduce ? "auto" : "smooth" });
    } catch (e) {
      nav.scrollLeft = target;
    }
  }

  function forceReveal(root) {
    // Panels start hidden, so scroll reveals never fire inside them —
    // show the items immediately when a panel is switched in.
    Array.prototype.forEach.call(root.querySelectorAll(".reveal"), function (el) {
      el.classList.add("is-visible");
    });
  }

  /* Sub-panel definitions for a panel: food categories use `subcategories`,
     the drinks panel uses `drinks.groups`. Null = panel isn't split. */
  function subPanelDefs(panelId) {
    if (panelId === "getraenke") {
      var gs = (DATA.dinner.drinks && DATA.dinner.drinks.groups) || [];
      var ok = gs.length > 1 && gs.every(function (g) { return !!g.title; });
      return ok ? gs : null;
    }
    var cat = null;
    DATA.dinner.categories.forEach(function (c) { if (c.id === panelId) cat = c; });
    return cat && hasSubPanels(cat) ? cat.subcategories : null;
  }

  function applySubPanels(catId) {
    var defs = subPanelDefs(catId);
    if (!defs) return;
    var idx = activeSubs[catId] || 0;
    if (idx >= defs.length) idx = 0;
    defs.forEach(function (_s, i) {
      var el = document.getElementById("abend-" + catId + "-sub-" + i);
      if (!el) return;
      el.hidden = i !== idx;
      if (i === idx) forceReveal(el);
    });
    var nav = document.querySelector('.menu-jump-sub[data-cat="' + catId + '"]');
    if (nav) {
      var activeBtn = null;
      Array.prototype.forEach.call(nav.querySelectorAll("button[data-subpanel]"), function (btn) {
        var on = Number(btn.getAttribute("data-subpanel")) === idx;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) activeBtn = btn;
      });
      centerPill(nav, activeBtn);
    }
  }

  function applyActivePanel() {
    if (!DATA) return;
    var ids = panelIds();
    if (ids.indexOf(activePanel) < 0) activePanel = ids[0];
    ids.forEach(function (id) {
      var sec = document.getElementById("abend-" + id);
      if (!sec) return;
      var active = id === activePanel;
      sec.hidden = !active;
      if (active) forceReveal(sec);
    });
    applySubPanels(activePanel);
    var jump = document.getElementById("dinnerJump");
    if (jump) {
      var activeBtn = null;
      Array.prototype.forEach.call(jump.querySelectorAll("button[data-panel]"), function (btn) {
        var on = btn.getAttribute("data-panel") === activePanel;
        btn.classList.toggle("is-active", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        if (on) activeBtn = btn;
      });
      centerPill(jump, activeBtn);
    }
  }

  function lang() {
    return (window.PHO && window.PHO.getLang && window.PHO.getLang()) || "de";
  }

  /* Localized value: plain strings pass through, {de,en} objects pick lang. */
  function loc(v, l) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    return v[l] != null ? v[l] : (v.de || "");
  }

  function fmtPrice(n, l) {
    var s = n.toFixed(2);
    if (l === "de") s = s.replace(".", ",");
    return s + " €";
  }

  function fmtSize(s, l) {
    if (!s) return "";
    return l === "en" ? s.replace(",", ".") : s;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function marksHtml(marks) {
    if (!marks || !marks.length) return "";
    var txt = marks.map(function (m) { return esc(m) + ")"; }).join(" ");
    return ' <sup class="dish-marks">' + txt + "</sup>";
  }

  function tagsHtml(tags) {
    if (!tags || !tags.length) return "";
    return tags.map(function (t) { return ' <span class="tag">' + esc(t) + "</span>"; }).join("");
  }

  /* ---------- Renderers ---------- */

  function dishItemHtml(dish, l, revealClass) {
    var name = esc(loc(dish.name, l));
    var desc = loc(dish.desc, l);
    var html = '<li class="menu-item' + revealClass + '">';
    html += '<span class="menu-no" aria-hidden="true">' + esc(dish.no) + "</span>";
    html += '<div class="menu-body"><h4 class="dish">' + name + marksHtml(dish.marks) + tagsHtml(dish.tags) + "</h4>";
    if (desc) html += '<p class="dish-desc">' + esc(desc) + "</p>";
    html += "</div>";
    if (dish.price != null) html += '<span class="price">' + fmtPrice(dish.price, l) + "</span>";
    html += "</li>";
    return html;
  }

  function renderLunch(l, animate) {
    var lunch = DATA.lunch;
    var revealClass = animate ? " reveal" : " reveal is-visible";

    var sub = document.getElementById("lunchSub");
    if (sub) sub.textContent = loc(lunch.subtitle, l);

    var starter = document.getElementById("lunchStarter");
    if (starter) {
      starter.innerHTML =
        '<span class="starter-text"><strong>' + esc(loc(lunch.starter.title, l)) + "</strong> — " +
        loc(lunch.starter.desc, l) + "</span>" +
        '<span class="price">' + fmtPrice(lunch.starter.price, l) + "</span>";
    }

    var list = document.getElementById("lunchList");
    if (list) {
      list.innerHTML = lunch.dishes.map(function (d) {
        return dishItemHtml(d, l, revealClass);
      }).join("");
      // lunch dish titles were h3 in the static markup; keep hierarchy there
      Array.prototype.forEach.call(list.querySelectorAll("h4.dish"), function (h) {
        var h3 = document.createElement("h3");
        h3.className = h.className;
        h3.innerHTML = h.innerHTML;
        h.parentNode.replaceChild(h3, h);
      });
    }

    var note = document.getElementById("lunchNote");
    if (note) note.innerHTML = loc(lunch.note, l);
  }

  function renderDinner(l, animate) {
    var revealClass = animate ? " reveal" : " reveal is-visible";
    var dinner = DATA.dinner;

    var jump = document.getElementById("dinnerJump");
    var menuRoot = document.getElementById("dinnerMenu");
    if (!menuRoot) return;

    var jumpLinks = [];
    var html = "";

    dinner.categories.forEach(function (cat) {
      var anchor = "abend-" + cat.id;
      var split = hasSubPanels(cat);
      jumpLinks.push('<button type="button" data-panel="' + esc(cat.id) + '" aria-pressed="false">' + esc(loc(cat.title, l)) + "</button>");
      html += '<section class="dinner-category" id="' + anchor + '" hidden>';
      html += '<h3 class="category-title">' + esc(loc(cat.title, l)) + "</h3>";
      if (split) {
        html += '<nav class="menu-jump menu-jump-sub" data-cat="' + esc(cat.id) + '" aria-label="' + esc(loc(cat.title, l)) + '">';
        cat.subcategories.forEach(function (sub, i) {
          html += '<button type="button" data-cat="' + esc(cat.id) + '" data-subpanel="' + i + '" aria-pressed="false">' + esc(loc(sub.title, l)) + "</button>";
        });
        html += "</nav>";
      }
      cat.subcategories.forEach(function (sub, i) {
        if (split) html += '<div class="dinner-subpanel" id="abend-' + esc(cat.id) + '-sub-' + i + '" hidden>';
        else if (sub.title) html += '<h4 class="subcategory-title">' + esc(loc(sub.title, l)) + "</h4>";
        if (sub.intro) html += '<p class="category-intro">' + esc(loc(sub.intro, l)) + "</p>";
        html += '<ol class="menu-list">' + sub.dishes.map(function (d) {
          return dishItemHtml(d, l, revealClass);
        }).join("") + "</ol>";
        if (split) html += "</div>";
      });
      html += "</section>";
    });
    menuRoot.innerHTML = html;
    if (!subJumpWired) {
      subJumpWired = true;
      // Delegate on the whole card so drinks sub-pills (#dinnerDrinks) work too.
      var cardRoot = document.getElementById("dinnerCard") || menuRoot;
      cardRoot.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("button[data-subpanel]") : null;
        if (!btn) return;
        activeSubs[btn.getAttribute("data-cat")] = Number(btn.getAttribute("data-subpanel"));
        applyActivePanel();
      });
    }

    // Drinks
    var drinksRoot = document.getElementById("dinnerDrinks");
    if (drinksRoot) {
      var dr = dinner.drinks;
      var drSplit = dr.groups && dr.groups.length > 1 && dr.groups.every(function (g) { return !!g.title; });
      var dh = '<section class="dinner-category" id="abend-getraenke" hidden>';
      dh += '<h3 class="category-title">' + esc(loc(dr.title, l)) + "</h3>";
      jumpLinks.push('<button type="button" data-panel="getraenke" aria-pressed="false">' + esc(loc(dr.title, l)) + "</button>");
      if (drSplit) {
        dh += '<nav class="menu-jump menu-jump-sub" data-cat="getraenke" aria-label="' + esc(loc(dr.title, l)) + '">';
        dr.groups.forEach(function (g, i) {
          dh += '<button type="button" data-cat="getraenke" data-subpanel="' + i + '" aria-pressed="false">' + esc(loc(g.title, l)) + "</button>";
        });
        dh += "</nav>";
      }
      dr.groups.forEach(function (g, i) {
        if (drSplit) dh += '<div class="dinner-subpanel" id="abend-getraenke-sub-' + i + '" hidden>';
        else dh += '<h4 class="subcategory-title">' + esc(loc(g.title, l)) + "</h4>";
        if (g.sizes) {
          dh += '<div class="table-scroll"><table class="drinks-table"><thead><tr><th scope="col"></th>';
          g.sizes.forEach(function (s) {
            dh += '<th scope="col">' + esc(fmtSize(s, l)) + "</th>";
          });
          dh += "</tr></thead><tbody>";
          g.items.forEach(function (it) {
            dh += '<tr><th scope="row">' + esc(loc(it.name, l)) + marksHtml(it.marks) + "</th>";
            it.prices.forEach(function (p) {
              dh += '<td>' + (p != null ? fmtPrice(p, l) : "–") + "</td>";
            });
            dh += "</tr>";
          });
          dh += "</tbody></table></div>";
        } else {
          dh += '<ul class="menu-list drinks-list">' + g.items.map(function (it) {
            var row = '<li class="menu-item' + revealClass + '">';
            row += '<div class="menu-body"><h4 class="dish">' + esc(loc(it.name, l)) + marksHtml(it.marks) + "</h4>";
            if (it.size) row += '<p class="dish-desc">' + esc(fmtSize(it.size, l)) + "</p>";
            row += "</div>";
            row += '<span class="price">' + fmtPrice(it.price, l) + "</span></li>";
            return row;
          }).join("") + "</ul>";
        }
        if (drSplit) dh += "</div>";
      });
      dh += "</section>";
      drinksRoot.innerHTML = dh;
    }

    // Notes + legend
    var legendRoot = document.getElementById("dinnerLegend");
    if (legendRoot) {
      var lg = dinner.legend;
      var lh = "";
      if (dinner.notes && dinner.notes.length) {
        lh += '<div class="dinner-notes">' + dinner.notes.map(function (n) {
          return '<p><span class="star" aria-hidden="true">★</span> ' + esc(loc(n.text, l)) + "</p>";
        }).join("") + "</div>";
      }
      lh += '<div class="legend-cols">';
      lh += '<div><h4 class="legend-title">' + esc(loc(lg.additivesTitle, l)) + "</h4><ul>";
      lg.additives.forEach(function (a) {
        lh += '<li><span class="legend-key">' + esc(a.key) + ")</span> " + esc(loc(a.label, l)) + "</li>";
      });
      lh += "</ul></div>";
      lh += '<div><h4 class="legend-title">' + esc(loc(lg.allergensTitle, l)) + "</h4><ul>";
      lg.allergens.forEach(function (a) {
        lh += '<li><span class="legend-key">' + esc(a.key) + ")</span> " + esc(loc(a.label, l)) + "</li>";
      });
      lh += "</ul></div></div>";
      legendRoot.innerHTML = lh;
    }

    if (jump) {
      jump.innerHTML = jumpLinks.join("");
      if (!jumpWired) {
        jumpWired = true;
        jump.addEventListener("click", function (e) {
          var btn = e.target.closest ? e.target.closest("button[data-panel]") : null;
          if (!btn) return;
          activePanel = btn.getAttribute("data-panel");
          applyActivePanel();
        });
      }
    }

    applyActivePanel();

    // Section headline pieces
    var title = document.getElementById("dinnerTitle");
    if (title) title.textContent = loc(dinner.title, l);
    var sub = document.getElementById("dinnerSub");
    if (sub) sub.textContent = loc(dinner.subtitle, l);
  }

  function renderHours(l) {
    var root = document.getElementById("hoursList");
    if (!root) return;
    root.innerHTML = DATA.hours.rows.map(function (row) {
      var dd = row.lines.map(function (line) {
        var s = esc(loc(line.time, l));
        if (line.note) s += ' <span class="hours-note">' + esc(loc(line.note, l)) + "</span>";
        return s;
      }).join("<br>");
      return '<div class="hours-row"><dt>' + esc(loc(row.days, l)) + "</dt><dd>" + dd + "</dd></div>";
    }).join("");
    var note = document.getElementById("kitchenNote");
    if (note) note.textContent = loc(DATA.hours.kitchenNote, l);
  }

  function renderAll(l, animate) {
    renderLunch(l, animate);
    renderDinner(l, animate);
    renderHours(l);

    var card = document.getElementById("dinnerCard");
    if (card) {
      card.hidden = false;
      card.classList.add("is-visible"); // the card itself; children stagger on scroll
    }
    if (window.PHO && window.PHO.observeReveals) {
      window.PHO.observeReveals(document);
    }
  }

  fetch("./menu.json", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("menu.json " + res.status);
      return res.json();
    })
    .then(function (data) {
      DATA = data;
      renderAll(lang(), true);
      document.addEventListener("pho:lang", function (e) {
        renderAll(e.detail.lang, false);
      });
    })
    .catch(function (err) {
      // Static German markup remains; dinner card stays hidden.
      console.warn("menu.json not loaded — keeping static fallback:", err);
    });
})();
