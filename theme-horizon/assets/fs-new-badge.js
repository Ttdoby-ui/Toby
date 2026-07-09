/*
 * Futurespin Filter-Panel-Kachel-Badges (kombiniert):
 *  1) rundes "NEU"-Kreis-Badge (Futurespin-Blau) auf Produkten, die vor
 *     <= 60 Tagen VERÖFFENTLICHT wurden (published_at).
 *  2) ersetzt das hartkodierte "Angebot"-Badge durch das echte Produkt-Badge
 *     (custom.price_badge_text/color) -> "Hauspreis" (blau) bzw. "Sale -30%".
 *
 * WICHTIG: Erfasst AUCH per Lazy-Load nachgeladene Produkte (Kollektionen >250,
 * z. B. Beläge 436). #fp-catalog-data enthält nur die erste Seite; die weiteren
 * Seiten (?page=N) werden hier – wie in filter-panel-main.js – nachgeladen und
 * ihre Produktdaten gemergt. Ohne Eingriff in die minifizierte Kachel-Logik;
 * robust bei Lazy-Load / Filter / Reset (MutationObserver).
 */
(function () {
  "use strict";
  var MAX_DAYS = 60;

  var root = document.querySelector("[data-fp-root]");
  var dataEl = document.getElementById("fp-catalog-data");
  var grid = root && root.querySelector("[data-fp-grid]");
  if (!root || !dataEl || !grid) return;

  var now = Date.now() / 1000;
  var newIds = Object.create(null); // id -> 1 (neu)
  var badgeMap = Object.create(null); // id -> {t, c}
  var seen = Object.create(null);

  function ingest(products) {
    (products || []).forEach(function (p) {
      if (!p || p.id == null) return;
      var id = String(p.id);
      if (seen[id]) return;
      seen[id] = 1;
      var pub = parseFloat(p.published);
      if (!isNaN(pub) && pub > 0 && now - pub <= 86400 * MAX_DAYS) newIds[id] = 1;
      if (p.badgeText) badgeMap[id] = { t: p.badgeText, c: p.badgeColor || "#486A8F" };
    });
  }

  var initial;
  try {
    initial = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }
  ingest(initial.products);

  if (!document.getElementById("fs-new-badge-css")) {
    var st = document.createElement("style");
    st.id = "fs-new-badge-css";
    st.textContent =
      ".fp-card__img{position:relative;}" +
      ".fp-card__new{position:absolute;top:6px;right:6px;z-index:2;width:44px;height:44px;" +
      "border-radius:50%;background:#486A8F;color:#fff;display:flex;align-items:center;" +
      "justify-content:center;font-size:.72rem;font-weight:700;letter-spacing:.04em;" +
      "text-transform:uppercase;box-shadow:0 1px 4px rgba(0,0,0,.28);pointer-events:none;}" +
      "@media screen and (max-width:749px){.fp-card__new{width:38px;height:38px;font-size:.64rem;}}";
    document.head.appendChild(st);
  }

  function apply(card) {
    var jb = card.querySelector(".jdgm-preview-badge[data-id]");
    if (!jb) return;
    var id = String(jb.getAttribute("data-id"));
    // 1) NEU-Badge
    if (newIds[id] && !card.querySelector(".fp-card__new")) {
      var img = card.querySelector(".fp-card__img");
      if (img) {
        var b = document.createElement("span");
        b.className = "fp-card__new";
        b.textContent = "NEU";
        img.appendChild(b);
      }
    }
    // 2) echtes Badge statt "Angebot"
    var bm = badgeMap[id];
    var badge = card.querySelector(".fp-card__sale-badge");
    if (bm && badge && !badge.getAttribute("data-fs-badge")) {
      badge.textContent = bm.t;
      badge.style.background = bm.c;
      badge.setAttribute("data-fs-badge", "1");
    }
  }

  function scan() {
    var cards = grid.querySelectorAll(".fp-card");
    for (var i = 0; i < cards.length; i++) apply(cards[i]);
  }

  scan();
  if ("MutationObserver" in window) {
    new MutationObserver(scan).observe(grid, { childList: true });
  }

  // Weitere Seiten nachladen (nur Daten mergen), damit Produkte jenseits der
  // ersten 250 ebenfalls erfasst werden.
  var total = parseInt(initial.total, 10);
  if (isNaN(total)) total = (initial.products || []).length;
  var pages = Math.min(Math.ceil(total / 250), 20);
  if (pages > 1) {
    var t = 2;
    (function nextPage() {
      if (t > pages) {
        scan();
        return;
      }
      fetch(location.pathname + "?page=" + t, { headers: { "X-Requested-With": "XMLHttpRequest" } })
        .then(function (r) {
          return r.ok ? r.text() : "";
        })
        .then(function (html) {
          if (html) {
            try {
              var el = new DOMParser().parseFromString(html, "text/html").getElementById("fp-catalog-data");
              if (el) {
                var d = JSON.parse(el.textContent);
                if (d && d.products) ingest(d.products);
              }
            } catch (e) {}
          }
          t++;
          scan();
          nextPage();
        })
        .catch(function () {
          t++;
          nextPage();
        });
    })();
  }
})();
