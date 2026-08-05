/**
 * Futurespin – Proxy für den KI-Schläger-Berater (Cloudflare Worker)
 *
 * WARUM ES DEN PROXY GIBT
 * Die Section `sections/schlaeger-berater.liquid` rief die Anthropic-API früher
 * direkt aus dem Browser auf (`x-api-key` + `anthropic-dangerous-allow-browser`).
 * Damit stand der API-Key im Quelltext des Shops – jeder Besucher konnte ihn
 * auslesen und auf unsere Rechnung nutzen. Jetzt ruft die Section nur noch
 * diesen Worker auf; der Key liegt hier als Secret und verlässt Cloudflare nie.
 *
 * Der Browser schickt ausschließlich `{ "prompt": "..." }`. Modell, max_tokens
 * und alle übrigen Parameter setzt der Worker – ein fremder Aufrufer kann den
 * Endpunkt also nicht als allgemeinen LLM-Zugang zweckentfremden.
 *
 * SETUP (einmalig, ~5 Minuten, Cloudflare-Free-Tier reicht)
 *   1. npm install -g wrangler   (oder: npx wrangler ...)
 *   2. wrangler login
 *   3. In diesem Ordner:  wrangler deploy
 *   4. wrangler secret put ANTHROPIC_API_KEY      → Key aus console.anthropic.com einfügen
 *   5. Die ausgegebene URL (https://futurespin-berater.<konto>.workers.dev) im
 *      Theme-Editor bei der Section „KI Schläger-Berater“ als „Berater-Proxy URL“
 *      eintragen.
 *
 * ZUSÄTZLICH IM ANTHROPIC-DASHBOARD
 *   Für den Key ein Ausgabenlimit setzen. Der Proxy begrenzt den Missbrauch,
 *   aber ein Limit ist die Reißleine, falls doch jemand die Origin-Prüfung umgeht
 *   (ein Origin-Header lässt sich außerhalb eines Browsers fälschen).
 */

// Nur von diesen Origins wird der Aufruf akzeptiert.
const ALLOWED_ORIGINS = [
  'https://futurespin.de',
  'https://www.futurespin.de',
  'https://e7ee88-2.myshopify.com',
];

// Der Prompt enthält den kompletten Katalog (~70.000 Zeichen). Alles deutlich
// darüber ist kein Berater-Aufruf mehr, sondern ein Missbrauchsversuch.
const MAX_PROMPT_CHARS = 120000;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // Preflight – Content-Type: application/json löst immer einen OPTIONS-Call aus.
    if (request.method === 'OPTIONS') {
      return allowed
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : new Response(null, { status: 403 });
    }

    if (request.method !== 'POST') {
      return json({ error: { message: 'Method not allowed' } }, 405, origin);
    }
    if (!allowed) {
      // Ohne CORS-Header antworten: der Browser würde die Antwort ohnehin verwerfen.
      return new Response('Forbidden', { status: 403 });
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: { message: 'Proxy ist nicht konfiguriert (Secret fehlt).' } }, 500, origin);
    }

    let prompt;
    try {
      const body = await request.json();
      prompt = body && body.prompt;
    } catch (e) {
      return json({ error: { message: 'Ungültiger Request-Body.' } }, 400, origin);
    }
    if (typeof prompt !== 'string' || prompt.length === 0) {
      return json({ error: { message: 'Feld "prompt" fehlt.' } }, 400, origin);
    }
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: { message: 'Prompt zu lang.' } }, 413, origin);
    }

    // Optionales Rate-Limit pro IP. Aktiv, sobald eine KV-Namespace-Bindung
    // namens RATE_LIMIT existiert; ohne Bindung wird der Block übersprungen.
    if (env.RATE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = 'rl:' + ip + ':' + Math.floor(Date.now() / 60000); // Fenster: 1 Minute
      const count = parseInt((await env.RATE_LIMIT.get(key)) || '0', 10);
      if (count >= 5) {
        return json({ error: { message: 'Zu viele Anfragen. Bitte kurz warten.' } }, 429, origin);
      }
      await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 120 });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // Antwort unverändert durchreichen – die Section parst sie wie bisher.
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
