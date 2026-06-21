# Toby – Shopify Backend Utilities

## Project Overview

This is a **Shopify backend integration project** for German e-commerce automation. It is **not** a Shopify theme — it provides two standalone automation utilities:

1. **DATEV Export** (`datev-export-app/`) – Exports Shopify order data as DATEV EXTF CSV for German accounting software
2. **Scheduled Items Processor** (`scripts/process-scheduled-items.mjs`) – Manages time-limited sales promotions and temporary collections via Shopify metaobjects

Both utilities run as **GitHub Actions workflows** on the `main` branch.

---

## Repository Structure

```
Toby/
├── .github/workflows/
│   ├── datev-export.yml              # Manual DATEV export (workflow_dispatch)
│   └── process-scheduled-items.yml  # Daily scheduled tasks (cron)
├── datev-export-app/
│   ├── config.mjs                   # DATEV client config and account defaults
│   ├── export.mjs                   # Main entry point (OAuth + REST + EXTF)
│   ├── package.json                 # ESM project, dependency: iconv-lite
│   └── lib/
│       ├── datev-extf.mjs           # EXTF format builder (header, booking rows)
│       ├── payment-methods.mjs      # Shopify gateway → payment method mapping
│       └── skr03-accounts.mjs       # German SKR03 chart-of-accounts mapping
├── scripts/
│   └── process-scheduled-items.mjs  # Scheduled sales/collections processor
├── CLAUDE.md
└── README.md                        # (empty)
```

---

## Technology Stack

- **Language:** JavaScript (ES Modules, `.mjs`)
- **Runtime:** Node.js >= 20
- **Dependencies:** Only `iconv-lite` ^0.6.3 (Windows-1252 encoding for DATEV)
- **Shopify API version:** `2025-01`
- **No build step, no test suite**

---

## DATEV Export App (`datev-export-app/`)

### What it does

Fetches all Shopify orders within a date range and produces a `DATEV_<from>_<to>.csv` in EXTF format (Data Category 21) encoded as Windows-1252 (ANSI), ready for import into DATEV Buchhalter/Kanzlei.

### Running locally

```bash
cd datev-export-app
npm install
DATEV_SHOPIFY_API_KEY=<key> DATEV_SHOPIFY_API_SECRET=<secret> SHOPIFY_STORE_DOMAIN=<store>.myshopify.com \
  node export.mjs 2026-01-01 2026-01-31
```

### Key modules

| File | Purpose |
|------|---------|
| `config.mjs` | DATEV advisor number (290882), client number (15000), fiscal year, account overrides |
| `export.mjs` | OAuth token fetch → Shopify REST paginated orders → EXTF file write |
| `lib/datev-extf.mjs` | `buildHeader()`, `bookingRowForOrder()`, `buildExtf()` — EXTF format rules |
| `lib/payment-methods.mjs` | `detectPaymentMethod()` — normalizes Shopify gateways to 8 canonical methods |
| `lib/skr03-accounts.mjs` | `paymentAccountFor()`, `revenueAccountFor()` — SKR03 account number lookup |

### EXTF format conventions

- Delimiter: semicolon (`;`)
- Text fields: double-quoted (`"`), inner quotes escaped as `""`
- Decimal separator: comma (`1234,50`)
- Date format: `TTMM` (day+month, 2+2 chars, no year in data rows)
- Line endings: CRLF
- Encoding: Windows-1252

### SKR03 default account mapping

**Payment accounts:**
| Method | Account |
|--------|---------|
| Shopify Payments | 1361 |
| PayPal | 1362 |
| Klarna | 1363 |
| Bank Transfer | 1200 |
| Cash on Delivery | 1360 |
| Cash | 1000 |
| Gift Card | 1590 |
| Other | 1360 |

**Revenue accounts:**
| VAT rate | Account |
|----------|---------|
| 19% | 8400 |
| 7% | 8300 |
| 0% / exempt | 8120 |

---

## Scheduled Items Processor (`scripts/process-scheduled-items.mjs`)

### What it does

Runs daily to process two types of Shopify metaobjects:

1. **`scheduled_sale`** – Time-limited variant price overrides
   - Active (end_date >= today): saves `pre_sale_price`, applies `sale_price`, sets `compareAtPrice`
   - Expired (end_date < today): restores original price, clears `compareAtPrice`, deletes metaobject
2. **`scheduled_collection`** – Temporary collections
   - Expired: deletes the collection and its metaobject entry
   - Active: no action

### Running locally

```bash
SHOPIFY_STORE_DOMAIN=<store>.myshopify.com SHOPIFY_ACCESS_TOKEN=<token> \
  node scripts/process-scheduled-items.mjs
```

### GraphQL operations used

- `metaobjects` query (filtered by type)
- `metaobjectUpdate` / `metaobjectDelete` mutations
- `productVariant` query
- `productVariantsBulkUpdate` mutation
- `collectionDelete` mutation

---

## GitHub Actions Workflows

### `datev-export.yml` — Manual DATEV Export

- **Trigger:** `workflow_dispatch` with inputs `date_from` (default `2026-06-01`) and `date_to` (default `2026-06-30`)
- **Secrets needed:** `DATEV_SHOPIFY_API_KEY`, `DATEV_SHOPIFY_API_SECRET`, `SHOPIFY_STORE_DOMAIN`
- **Auth:** Client Credentials OAuth (see below)
- **Output:** Artifact `DATEV_<from>_<to>.csv`, retained 90 days

### `process-scheduled-items.yml` — Daily Scheduler

- **Trigger:** Cron `0 1 * * *` (01:00 UTC daily) or `workflow_dispatch`
- **Secrets needed:** `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`
- **Auth:** Static access token

---

## Shopify Authentication

### Client Credentials Grant (DATEV export)

Used when a long-lived static token is not available. Token expires after ~24h.

```http
POST https://api.shopify.com/auth/access_token
Content-Type: application/json

{ "client_id": "...", "client_secret": "...", "grant_type": "client_credentials" }
```

GitHub Actions secrets: `DATEV_SHOPIFY_API_KEY` (client_id) + `DATEV_SHOPIFY_API_SECRET` (client_secret)

### Static Access Token (scheduled items)

GitHub Actions secret: `SHOPIFY_ACCESS_TOKEN`

---

## Shopify App Development

- Apps are created exclusively via the **Dev Dashboard** (`dev.shopify.com/dashboard`) — not through the Shopify Admin
- Scopes are configured under **Konfiguration → Admin-API-Bereiche** in the Dev Dashboard, then the app must be installed on the store
- The "Schlüssel" field in the Dev Dashboard is the **client secret** (not directly usable as an access token)
- **No static `SHOPIFY_ACCESS_TOKEN` secret** for the DATEV app — use `SHOPIFY_API_KEY` + `SHOPIFY_API_SECRET`

---

## Shopify Theme Rules

- **All changes go to the draft Horizon theme first** (ID: `gid://shopify/OnlineStoreTheme/199959052636`, UNPUBLISHED)
- Only transfer to the live theme ("Updated copy of Horizon", ID: `gid://shopify/OnlineStoreTheme/184788123996`, MAIN) after explicit user approval
- **Never write directly to the active/live theme** without explicit instruction

---

## Git Conventions

- Current feature branch: `claude/claude-md-docs-dtsfqn`
- Never push to a different branch without explicit permission
- Never create a pull request without an explicit request
- Commit messages: descriptive and in English
