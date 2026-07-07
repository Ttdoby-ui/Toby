/*
 * Futurespin: "-X%"-Rabatt-Chip auf Filter-Panel-Kacheln, aber NUR bei echten
 * zeitlich begrenzten Angeboten (Variante hat custom.pre_sale_price -> onSale
 * im #fp-catalog-data). Der -10% Hauspreis ist bewusst ausgenommen.
 * % = gerundet (Vergleichspreis/UVP - Preis) / UVP * 100.
 * Robust ohne Eingriff in die minifizierte Kachel-Logik (MutationObserver).
 */
(function () {
  "use strict";
  var root = document.querySelector("[data-fp-root]");
  var dataEl = document.getElementById("fp-catalog-data");
  var grid = root && root.querySelector("[data-fp-grid]");
  if (!root || !dataEl || !grid) return;

  // Produkt-ID -> Rabatt-% (nur onSale + echter Markdown).
  var pctById = Object.create(null);
  try {
    var data = JSON.parse(dataEl.textContent);
    (data.products || []).forEach(function (p) {
      if (!p || p.id == null || p.onSale !== true) return;
      var price = typeof p.price === "number" ? p.price : parseFloat(p.price);
      var uvp = typeof p.compareAt === "number" ? p.compareAt : parseFloat(p.compareAt);
      if (!(uvp > 0) || !(price >= 0) || uvp <= price) return;
      var pct = Math.round((uvp - price) / uvp * 100);
      if (pct > 0) pctById[String(p.id)] = pct;
    });
  } catch (e) {
    return;
  }
  if (!Object.keys(pctById).length) return;

  if (!document.getElementById("fs-sale-pct-css")) {
    var st = document.createElement("style");
    st.id = "fs-sale-pct-css";
    st.textContent =
      ".fp-card__pct{display:inline-block;background:#dc2626;color:#fff;font-size:.7em;" +
      "font-weight:700;padding:.12em .4em;border-radius:3px;margin-right:.35em;" +
      "vertical-align:middle;line-height:1.4;white-space:nowrap;}";
    document.head.appendChild(st);
  }

  function tag(card) {
    if (card.querySelector(".fp-card__pct")) return;
    var jb = card.querySelector(".jdgm-preview-badge[data-id]");
    if (!jb) return;
    var pct = pctById[String(jb.getAttribute("data-id"))];
    if (!pct) return;
    var priceEl = card.querySelector(".fp-card__price");
    if (!priceEl) return;
    var chip = document.createElement("span");
    chip.className = "fp-card__pct";
    chip.textContent = "-" + pct + "%";
    priceEl.insertBefore(chip, priceEl.firstChild);
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
