"""
Lesen und Schreiben der Kollektionsrabatt-Konfiguration.

Die Function `kollektionsrabatt` (App "VIP Belaege Discount") liest ihre
Einstellungen zur Laufzeit aus einem JSON-Metafeld am jeweiligen
DiscountAutomaticNode:

    namespace: kollektionsrabatt
    key:       config
    type:      json
    value: {
      "collectionIds": ["gid://shopify/Collection/607791087964"],
      "tiers":    [{"quantity": 2, "percentage": 15}, ...],   # leer = VIP-only
      "vipTags":  ["VIP1", "VIP2", "VIP3"],
      "vipTiers": [{"tag": "VIP1", "percentage": 15}, ...]
    }

Deshalb genuegt ein metafieldsSet, um Staffeln zu aendern - kein erneutes
Deployen der Function.

WICHTIG: Es gibt bei Functions KEIN Entwurf/Live wie beim Theme. Ein
Schreibvorgang wirkt sofort auf die Preise im Warenkorb. Der Aufrufer muss den
Nutzer vorher bestaetigen lassen.
"""

import json

from shopify_api import ShopifyError, gql

NAMESPACE = "kollektionsrabatt"
KEY = "config"

_LIST_QUERY = """
query($first: Int!) {
  discountNodes(first: $first, query: "type:app") {
    nodes {
      id
      metafield(namespace: "kollektionsrabatt", key: "config") { type value }
      automaticDiscount {
        __typename
        ... on DiscountAutomaticApp {
          title
          status
          startsAt
          endsAt
          combinesWith { orderDiscounts productDiscounts shippingDiscounts }
        }
      }
    }
  }
}
"""

_COLLECTION_QUERY = """
query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Collection { id title handle productsCount { count } }
  }
}
"""

_SET_MUTATION = """
mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id updatedAt }
    userErrors { field message code }
  }
}
"""


def _parse_config(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def list_discounts() -> list[dict]:
    """Alle App-Rabatte, die ein kollektionsrabatt-Config-Metafeld tragen."""
    data = gql(_LIST_QUERY, {"first": 50})
    out = []
    for node in data["discountNodes"]["nodes"]:
        discount = node.get("automaticDiscount") or {}
        if discount.get("__typename") != "DiscountAutomaticApp":
            continue
        config = _parse_config((node.get("metafield") or {}).get("value"))
        if config is None:
            # z. B. die POS-Abrundung - die hat ihre Stufe fest im Code.
            continue
        out.append(
            {
                "id": node["id"],
                "title": discount.get("title") or "(ohne Titel)",
                "status": discount.get("status"),
                "startsAt": discount.get("startsAt"),
                "endsAt": discount.get("endsAt"),
                "combinesWith": discount.get("combinesWith") or {},
                "config": config,
            }
        )
    out.sort(key=lambda d: d["title"].lower())
    return out


def get_discount(node_id: str) -> dict:
    for item in list_discounts():
        if item["id"] == node_id:
            return item
    raise ShopifyError(f"Kein Rabatt mit Config-Metafeld unter {node_id}")


def collection_titles(gids: list[str]) -> dict[str, dict]:
    """Kollektions-GID -> {title, handle, count}. Fehlende bleiben aussen vor."""
    gids = [g for g in dict.fromkeys(gids) if g]
    if not gids:
        return {}
    data = gql(_COLLECTION_QUERY, {"ids": gids})
    result = {}
    for node in data.get("nodes") or []:
        if node and node.get("id"):
            result[node["id"]] = {
                "title": node.get("title") or "",
                "handle": node.get("handle") or "",
                "count": (node.get("productsCount") or {}).get("count"),
            }
    return result


def normalise_tiers(raw_pairs: list[tuple[str, str]]) -> list[dict]:
    """
    Formularwerte -> saubere Staffelliste.

    Leere Zeilen werden uebersprungen; eine halb ausgefuellte Zeile ist ein
    Fehler, damit niemand versehentlich eine Staffel ohne Prozentsatz anlegt.
    Sortiert nach Menge, weil die Function die hoechste passende Staffel nimmt.
    """
    tiers: list[dict] = []
    for index, (qty_raw, pct_raw) in enumerate(raw_pairs, start=1):
        qty_raw = (qty_raw or "").strip()
        pct_raw = (pct_raw or "").strip()
        if not qty_raw and not pct_raw:
            continue
        if not qty_raw or not pct_raw:
            raise ValueError(f"Staffel {index}: Menge und Prozent muessen beide gesetzt sein.")
        try:
            quantity = int(qty_raw)
            percentage = float(pct_raw.replace(",", "."))
        except ValueError:
            raise ValueError(f"Staffel {index}: Menge oder Prozent ist keine Zahl.")
        if quantity < 1:
            raise ValueError(f"Staffel {index}: Menge muss mindestens 1 sein.")
        if not 0 < percentage <= 100:
            raise ValueError(f"Staffel {index}: Prozentsatz muss zwischen 0 und 100 liegen.")
        tiers.append({"quantity": quantity, "percentage": percentage})

    quantities = [t["quantity"] for t in tiers]
    if len(set(quantities)) != len(quantities):
        raise ValueError("Zwei Staffeln haben dieselbe Menge.")

    tiers.sort(key=lambda t: t["quantity"])

    # Eine hoehere Menge mit kleinerem Rabatt waere fuer Kunden unverstaendlich
    # und macht die Staffel wirkungslos, weil die hoechste passende gewinnt.
    for previous, current in zip(tiers, tiers[1:]):
        if current["percentage"] < previous["percentage"]:
            raise ValueError(
                f"Ab {current['quantity']} Stueck waere der Rabatt kleiner "
                f"als ab {previous['quantity']} Stueck."
            )
    return tiers


def normalise_vip_tiers(raw_pairs: list[tuple[str, str]]) -> list[dict]:
    tiers: list[dict] = []
    for tag_raw, pct_raw in raw_pairs:
        tag = (tag_raw or "").strip()
        pct_raw = (pct_raw or "").strip()
        if not tag and not pct_raw:
            continue
        if not tag or not pct_raw:
            raise ValueError("VIP-Stufe: Tag und Prozent muessen beide gesetzt sein.")
        try:
            percentage = float(pct_raw.replace(",", "."))
        except ValueError:
            raise ValueError(f"VIP-Stufe {tag}: Prozentsatz ist keine Zahl.")
        if not 0 < percentage <= 100:
            raise ValueError(f"VIP-Stufe {tag}: Prozentsatz muss zwischen 0 und 100 liegen.")
        tiers.append({"tag": tag, "percentage": percentage})

    tags = [t["tag"] for t in tiers]
    if len(set(tags)) != len(tags):
        raise ValueError("Ein VIP-Tag kommt doppelt vor.")
    return tiers


def build_config(current: dict, tiers: list[dict], vip_tiers: list[dict]) -> dict:
    """
    Neue Konfiguration aus der alten ableiten.

    collectionIds bleiben unangetastet - die Kollektion eines Rabatts zu
    wechseln ist ein Eingriff, der ueber diese Oberflaeche bewusst nicht geht.
    vipTags wird aus vipTiers abgeleitet, damit beide nie auseinanderlaufen.
    """
    config = dict(current)
    config["tiers"] = tiers
    config["vipTiers"] = vip_tiers
    config["vipTags"] = [t["tag"] for t in vip_tiers]
    return config


def diff_config(old: dict, new: dict) -> list[str]:
    """Menschenlesbare Liste der Aenderungen - Grundlage fuer die Bestaetigung."""
    lines: list[str] = []

    def fmt_tiers(tiers):
        if not tiers:
            return "keine (nur VIP)"
        return ", ".join(f"ab {t['quantity']} Stk. {t['percentage']:g} %" for t in tiers)

    def fmt_vip(tiers):
        if not tiers:
            return "keine"
        return ", ".join(f"{t['tag']} {t['percentage']:g} %" for t in tiers)

    if old.get("tiers") != new.get("tiers"):
        lines.append(f"Mengenstaffeln: {fmt_tiers(old.get('tiers'))}  ->  {fmt_tiers(new.get('tiers'))}")
    if old.get("vipTiers") != new.get("vipTiers"):
        lines.append(f"VIP-Stufen: {fmt_vip(old.get('vipTiers'))}  ->  {fmt_vip(new.get('vipTiers'))}")
    return lines


def save_config(node_id: str, config: dict) -> None:
    data = gql(
        _SET_MUTATION,
        {
            "metafields": [
                {
                    "ownerId": node_id,
                    "namespace": NAMESPACE,
                    "key": KEY,
                    "type": "json",
                    "value": json.dumps(config, ensure_ascii=False),
                }
            ]
        },
    )
    errors = data["metafieldsSet"]["userErrors"]
    if errors:
        raise ShopifyError("; ".join(f"{e.get('field')}: {e.get('message')}" for e in errors))
