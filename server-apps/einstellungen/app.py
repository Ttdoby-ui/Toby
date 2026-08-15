"""
Futurespin Einstellungen - Weboberflaeche fuer die kopflosen Shopify-Apps.

WARUM ES DAS GIBT
Die App "VIP Belaege Discount" hat keine Admin-UI-Extension. Klickt man ihre
Rabatte im Shopify-Admin an, leitet Shopify auf die application_url um
(futurespin.de) - es gibt also gar kein Formular. Staffeln liessen sich bisher
nur ueber einen GitHub-Workflow oder direkte API-Aufrufe aendern. Diese Seite
schliesst genau diese Luecke.

STAND v1: Mengen- und VIP-Staffeln der kollektionsrabatt-Rabatte.
Nicht dabei (weil im Function-Code fest verdrahtet, Aenderung braucht Deploy):
POS-Abrundung (STEP_CENTS) und hide-b2b-versand (B2B-Tagliste).

BETRIEB
  Port 5001 (5000 gehoert der Logistik-App), nur auf 127.0.0.1, davor Caddy.
  Siehe README.md.
"""

import os
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

import rabatte
from shopify_api import ShopifyError

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "einstellungen.db"

class PrefixMiddleware:
    """
    Macht die App unter einem Unterpfad lauffaehig (z. B. /einstellungen).

    Ohne das erzeugt url_for() Links wie /login - hinter einem Reverse-Proxy,
    der die App unter app.futurespin.de/einstellungen/ ausliefert, landet man
    damit in der Logistik-App auf Port 5000 statt hier.

    Caddy schickt den Prefix als X-Forwarded-Prefix mit. Wir setzen daraus
    SCRIPT_NAME - dann baut Flask alle Links korrekt und legt das
    Session-Cookie auf denselben Pfad, kollidiert also auch nicht mit dem
    Cookie der Logistik-App.

    Funktioniert mit beiden Caddy-Varianten: handle_path (schneidet den Prefix
    schon ab) und handle (schickt ihn mit) - deshalb die Laengenpruefung.
    """

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        prefix = (environ.get("HTTP_X_FORWARDED_PREFIX") or "").rstrip("/")
        if prefix:
            environ["SCRIPT_NAME"] = prefix
            pfad = environ.get("PATH_INFO", "")
            if pfad.startswith(prefix):
                environ["PATH_INFO"] = pfad[len(prefix):] or "/"
        return self.wsgi_app(environ, start_response)


app = Flask(__name__)
app.wsgi_app = PrefixMiddleware(app.wsgi_app)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or os.urandom(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
# Caddy terminiert TLS; die Anwendung selbst sieht http. Das Cookie soll
# trotzdem nur ueber https ausgeliefert werden.
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("COOKIE_INSECURE", "").lower() != "true"


# ---------------------------------------------------------------- Protokoll

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS aenderung (
              id        INTEGER PRIMARY KEY AUTOINCREMENT,
              zeit      TEXT NOT NULL,
              rabatt_id TEXT NOT NULL,
              titel     TEXT NOT NULL,
              diff      TEXT NOT NULL,
              vorher    TEXT NOT NULL,
              nachher   TEXT NOT NULL
            )
            """
        )


def protokolliere(rabatt_id: str, titel: str, diff: list[str], vorher: str, nachher: str):
    with db() as conn:
        conn.execute(
            "INSERT INTO aenderung (zeit, rabatt_id, titel, diff, vorher, nachher)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
                rabatt_id,
                titel,
                "\n".join(diff),
                vorher,
                nachher,
            ),
        )


# -------------------------------------------------------------------- Auth

def require_login(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get("angemeldet"):
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)

    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    erwartet = os.environ.get("EINSTELLUNGEN_PASSWORT") or ""
    if not erwartet:
        return "EINSTELLUNGEN_PASSWORT ist nicht gesetzt - Anmeldung deaktiviert.", 500

    if request.method == "POST":
        # Konstantzeit-Vergleich, damit das Passwort nicht ueber Laufzeiten
        # erratbar wird.
        import hmac

        if hmac.compare_digest(request.form.get("passwort", ""), erwartet):
            session["angemeldet"] = True
            ziel = request.args.get("next") or url_for("index")
            return redirect(ziel if ziel.startswith("/") else url_for("index"))
        flash("Passwort stimmt nicht.", "fehler")

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ------------------------------------------------------------------ Seiten

@app.route("/")
@require_login
def index():
    try:
        discounts = rabatte.list_discounts()
        alle_gids = [g for d in discounts for g in d["config"].get("collectionIds", [])]
        kollektionen = rabatte.collection_titles(alle_gids)
    except ShopifyError as exc:
        return render_template("fehler.html", meldung=str(exc)), 502

    with db() as conn:
        letzte = conn.execute(
            "SELECT zeit, titel, diff FROM aenderung ORDER BY id DESC LIMIT 10"
        ).fetchall()

    return render_template(
        "index.html", discounts=discounts, kollektionen=kollektionen, letzte=letzte
    )


@app.route("/rabatt/<path:node_id>", methods=["GET", "POST"])
@require_login
def rabatt_bearbeiten(node_id):
    node_id = node_id if node_id.startswith("gid://") else f"gid://shopify/DiscountAutomaticNode/{node_id}"

    try:
        aktuell = rabatte.get_discount(node_id)
    except ShopifyError as exc:
        return render_template("fehler.html", meldung=str(exc)), 404

    config = aktuell["config"]

    if request.method == "POST":
        try:
            tiers = rabatte.normalise_tiers(
                [
                    (request.form.get(f"menge{i}", ""), request.form.get(f"prozent{i}", ""))
                    for i in range(1, 6)
                ]
            )
            vip = rabatte.normalise_vip_tiers(
                [
                    (request.form.get(f"viptag{i}", ""), request.form.get(f"vipprozent{i}", ""))
                    for i in range(1, 6)
                ]
            )
        except ValueError as exc:
            flash(str(exc), "fehler")
            return render_template("rabatt.html", d=aktuell, config=config)

        neu = rabatte.build_config(config, tiers, vip)
        diff = rabatte.diff_config(config, neu)

        if not diff:
            flash("Nichts geaendert.", "hinweis")
            return redirect(url_for("index"))

        # Zwei Schritte: erst zeigen, was passieren wuerde, dann schreiben.
        # Function-Rabatte greifen sofort - ohne Zwischenschritt waere ein
        # Vertipper unmittelbar im Warenkorb der Kunden.
        if request.form.get("bestaetigt") != "ja":
            return render_template(
                "bestaetigen.html", d=aktuell, diff=diff, tiers=tiers, vip=vip
            )

        import json

        try:
            rabatte.save_config(node_id, neu)
        except ShopifyError as exc:
            flash(f"Speichern fehlgeschlagen: {exc}", "fehler")
            return render_template("rabatt.html", d=aktuell, config=config)

        protokolliere(
            node_id,
            aktuell["title"],
            diff,
            json.dumps(config, ensure_ascii=False),
            json.dumps(neu, ensure_ascii=False),
        )
        flash("Gespeichert - die Aenderung ist sofort aktiv.", "ok")
        return redirect(url_for("index"))

    return render_template("rabatt.html", d=aktuell, config=config)


@app.route("/protokoll")
@require_login
def protokoll():
    with db() as conn:
        eintraege = conn.execute(
            "SELECT zeit, titel, diff FROM aenderung ORDER BY id DESC LIMIT 200"
        ).fetchall()
    return render_template("protokoll.html", eintraege=eintraege)


@app.route("/healthz")
def healthz():
    return "ok", 200


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5001")))
