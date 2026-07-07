/*
 * Futurespin: rundes "NEU"-Badge (Futurespin-Blau #486A8F) auf Filter-Panel-
 * Kacheln, deren Produkt vor <= 60 Tagen VERÖFFENTLICHT wurde (published_at
 * aus #fp-catalog-data). Läuft ohne Eingriff in die minifizierte Kachel-Logik:
 * - liest die neuen Produkt-IDs aus dem JSON,
 * - injiziert das CSS einmalig,
 * - taggt gerenderte Kacheln (per jdgm-preview-badge[data-id]) und
 * - beobachtet das Grid (Lazy-Load / Filter / Reset re-rendern Kacheln).
 */
(function () {
  "use strict";
  var MAX_DAYS = 60;

  var root = document.querySelector("[data-fp-root]");
  var dataEl = document.getElementById("fp-catalog-data");
  var grid = root && root.querySelector("[data-fp-grid]");
  if (!root || !dataEl || !grid) return;

  // Set der "neuen" Produkt-IDs aus dem Katalog-JSON.
  var newIds = Object.create(null);
  try {
    var data = JSON.parse(dataEl.textContent);
    var now = Date.now() / 1000;
    (data.products || []).forEach(function (p) {
      if (!p || p.id == null) return;
      var c = parseFloat(p.published);
      if (!isNaN(c) && c > 0 && now - c <= 86400 * MAX_DAYS) {
        newIds[String(p.id)] = 1;
      }
    });
  } catch (e) {
    return;
  }
  if (!Object.keys(newIds).length) return;

  // CSS einmalig einfügen.
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

  function tag(card) {
    if (card.querySelector(".fp-card__new")) return;
    var jb = card.querySelector(".jdgm-preview-badge[data-id]");
    if (!jb || !newIds[String(jb.getAttribute("data-id"))]) return;
    var imgWrap = card.querySelector(".fp-card__img");
    if (!imgWrap) return;
    var b = document.createElement("span");
    b.className = "fp-card__new";
    b.textContent = "NEU";
    imgWrap.appendChild(b);
  }

  function scan() {
    var cards = grid.querySelectorAll(".fp-card");
    for (var i = 0; i < cards.length; i++) tag(cards[i]);
  }

  scan();
  if ("MutationObserver" in window) {
    new MutationObserver(scan).observe(grid, { childList: true });
  }
})();
