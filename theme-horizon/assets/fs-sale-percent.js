/*
 * Futurespin: ersetzt auf den Filter-Panel-Kacheln das hartkodierte
 * "Angebot"-Badge durch das ECHTE Produkt-Badge aus custom.price_badge_text /
 * price_badge_color – also "Hauspreis" (blau #486A8F) bzw. bei zeitlich
 * begrenzten Angeboten "Sale -30%" (inkl. Rabatt-% zur UVP). So sind Kacheln
 * und Produktseite konsistent. Ohne Eingriff in die minifizierte Kachel-Logik;
 * robust bei Lazy-Load / Filter / Reset (MutationObserver).
 */
(function () {
  "use strict";
  var root = document.querySelector("[data-fp-root]");
  var dataEl = document.getElementById("fp-catalog-data");
  var grid = root && root.querySelector("[data-fp-grid]");
  if (!root || !dataEl || !grid) return;

  var byId = Object.create(null);
  try {
    var data = JSON.parse(dataEl.textContent);
    (data.products || []).forEach(function (p) {
      if (p && p.id != null && p.badgeText) {
        byId[String(p.id)] = { t: p.badgeText, c: p.badgeColor || "#486A8F" };
      }
    });
  } catch (e) {
    return;
  }
  if (!Object.keys(byId).length) return;

  function fix(card) {
    var badge = card.querySelector(".fp-card__sale-badge");
    if (!badge || badge.getAttribute("data-fs-badge")) return;
    var jb = card.querySelector(".jdgm-preview-badge[data-id]");
    if (!jb) return;
    var b = byId[String(jb.getAttribute("data-id"))];
    if (!b) return;
    badge.textContent = b.t;
    badge.style.background = b.c;
    badge.setAttribute("data-fs-badge", "1");
  }

  function scan() {
    var cards = grid.querySelectorAll(".fp-card");
    for (var i = 0; i < cards.length; i++) fix(cards[i]);
  }

  scan();
  if ("MutationObserver" in window) {
    new MutationObserver(scan).observe(grid, { childList: true });
  }
})();
