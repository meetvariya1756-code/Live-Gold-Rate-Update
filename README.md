# Gold Rate Pricer — Shopify jewellery pricing middleware

Multi-store Shopify middleware that prices every jewellery **variant** from the day's **metal rate**
(gold / silver / platinum) plus weight, making charges (majuri), wastage, diamond / gemstone charges,
labour, hallmark, extra charges, markup and GST — and pushes the price, compare-at price and a
**price breakup** to Shopify so the website can show it live.

Stack: **Next.js 15 (App Router, API routes = backend) + React 19 (frontend) + PostgreSQL** (`pg`, no ORM).

---

## 1. How it works (flow)

1. **Connect store** — enter `xyz.myshopify.com` + Admin API access token. The token is verified,
   stored AES-256-GCM encrypted, and **all products + variants sync automatically** in the background.
   Connect as many client stores as you want; each store has its own rates and settings.
2. **Set today's rate** — on the store page, enter the **24K rate per gram** (and silver / platinum if used).
   22K / 18K / 14K / 10K / 9K and Silver 925 are **auto-derived from purity** (can be switched to manual per purity).
3. **Configure products** — open a product. Variants are **auto-grouped** by every option except *Size*
   (e.g. `14KT · Rose Gold → sizes 5, 6, 7`). Open a group → open a size → fill the form
   (weight, making charge, wastage, diamond, stones, labour, GST …). The **live breakup** updates as you type.
   **Save** → the variant turns **green** and the next size opens. Tools in each group:
   *Copy charges from size X to all sizes* (optionally incl. weight) and *Save all in group*.
   When every variant of a group is saved, the group turns green; the product shows *✓ Done*.
4. **Daily update** — next day, change the 24K rate and press **Save & update Shopify prices**.
   Every configured variant of that store is recalculated and pushed to Shopify in the background
   (progress + history shown on the page).
5. **Website breakup** — each push also writes the variant metafield `gold_pricing.breakup` (JSON).
   The included theme snippet shows the breakup on the product page and switches with the selected variant.

Bulk setup: **Export CSV** (all variants + current config) → fill in Excel → **Import CSV**
(matches by `variant_gid`, or by SKU).

---

## 2. Price formula

```
metal value   = weight(g) × rate per gram of selected purity
wastage       = metal value × wastage %
making        = per gram:  weight × value
                percent:   metal value × value %
                fixed:     value
diamond       = diamond charge + Σ(diamond stones carat × price/ct)
gemstone      = gemstone charge + Σ(other stones carat × price/ct)
other         = hallmark + misc
base          = metal + wastage + making + diamond + gemstone + labour + other
markup        = base × markup %
subtotal      = base + markup
total         = round(subtotal × (1 + GST%), store rounding step)     → Shopify "price"
compare-at    = round(total × (1 + compare margin %))                 → Shopify "compare at price" (0 % = none)
```

Customer-facing breakup lines: *Metal (weight × rate)*, *Making charges* (= making + wastage + labour + markup),
*Diamond*, *Gemstone*, *Other charges*, *GST*, *Total*. Rounding difference is absorbed in the GST line so
the lines always add up to the total. Edit `src/lib/pricing.ts` to change the formula or the labels —
it is shared by the UI preview and the server.

---

## 3. Setup

Requirements: Node 20+, PostgreSQL 13+.

```bash
cp .env.example .env          # fill in values (see below)
npm install
npm run db:migrate            # creates tables (safe to re-run)
npm run dev                   # http://localhost:3000   (production: npm run build && npm start)
```

`.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Set `DATABASE_SSL=true` for managed DBs that need SSL. |
| `ADMIN_PASSWORD` | Login password for the panel. |
| `SESSION_SECRET` | Long random string for signing the login cookie. |
| `ENCRYPTION_KEY` | 64 hex chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Don't change it later** or saved tokens can't be decrypted. |
| `SHOPIFY_API_VERSION` | Default `2025-10`. |
| `CRON_SECRET` | Secret for the optional scheduled update endpoint. |

### Getting the Shopify access token (per client store)

Shopify admin → **Settings → Apps and sales channels → Develop apps** → *Create an app* →
**Configure Admin API scopes**: `read_products`, `write_products` → **Install app** →
copy the **Admin API access token** (`shpat_…`, shown once). Paste it with the store domain in *Connect store*.

On first sync the app creates the variant metafield definition `gold_pricing.breakup`
(type JSON, storefront read access) automatically.

---

## 4. Show the breakup on the website

1. Theme editor → **Edit code** → *Snippets* → **Add a new snippet** `gold-price-breakup` → paste
   `theme/snippets/gold-price-breakup.liquid`.
2. In the product section (e.g. `sections/main-product.liquid`, or a **Custom Liquid** block in the
   product template) add:

   ```liquid
   {% render 'gold-price-breakup', product: product %}
   ```

The snippet renders a collapsible table, reads the metafield of every variant, and switches automatically when
the customer selects another size / purity / colour. It is hidden for products that were never priced by the app.
Style it freely — all classes start with `gp-`.

Alternative (headless / custom front-end): `GET /api/public/breakup?shop=xyz.myshopify.com&product=<numeric id>`
returns the live-calculated breakup for all configured variants (CORS enabled).

---

## 5. Scheduled updates (optional)

Rates are entered manually, so the normal way is the **Save & update Shopify prices** button.
If you later plug in a live rate feed, enable *"Include this store in the scheduled price update"* in store
settings and call:

```
GET /api/cron/update-prices?secret=CRON_SECRET        (or header Authorization: Bearer CRON_SECRET)
```

from any cron (server crontab, cron-job.org, Vercel Cron…).

---

## 6. Project structure

```
db/schema.sql                         tables: stores, metal_rates, rate_history, products, variants,
                                      variant_configs, price_runs
scripts/migrate.mjs                   applies schema.sql
src/lib/pricing.ts                    ★ formula, default metals/purities, auto-derive rates (shared client+server)
src/lib/grouping.ts                   variant grouping (all options except Size)
src/lib/shopify.ts                    Admin GraphQL client (throttle/retry), product sync queries,
                                      productVariantsBulkUpdate + metafield
src/lib/services.ts                   sync, save config, push-prices job
src/lib/crypto.ts                     token encryption
src/middleware.ts                     password login guard
src/app/page.tsx                      stores list + connect store
src/app/stores/[storeId]/page.tsx     rates, stats, price update runs, product list, CSV, settings
src/app/stores/[storeId]/products/[productId]/page.tsx   variant groups + pricing form + live breakup
src/app/api/...                       REST API (below)
theme/snippets/gold-price-breakup.liquid
```

### API

| Method | Route | |
|---|---|---|
| GET / POST | `/api/stores` | list / connect store `{shop_domain, access_token, name?, default_gst_pct?, round_to?}` |
| GET / PATCH / DELETE | `/api/stores/:id` | details / settings (`name, default_gst_pct, round_to, auto_push, access_token`) / disconnect |
| POST | `/api/stores/:id/sync` | re-sync all products from Shopify |
| GET / PUT | `/api/stores/:id/rates` | rates / save `{rates:[{key, rate, auto?}], push?:true}` |
| GET | `/api/stores/:id/products?search=&filter=all\|pending\|partial\|done&page=` | product list |
| GET | `/api/stores/:id/products/:numericProductId?refresh=1` | product, variants, configs, rates |
| PUT / DELETE | `/api/stores/:id/variants/config` | save `{items:[{variant_gid, config}]}` / reset `{variant_gids:[]}` |
| POST | `/api/stores/:id/push` | push all (background) or `{product_gids:[…]}` (waits) |
| GET | `/api/stores/:id/runs` | price update history |
| GET / POST | `/api/stores/:id/export` · `/import` | CSV bulk setup |
| GET | `/api/cron/update-prices` | scheduled push (secret) |
| GET | `/api/public/breakup` | public breakup JSON (CORS) |

All `/api/*` routes except `cron` and `public` need the login cookie. If you merge this into your existing
middleware, replace `src/middleware.ts` with your own auth and keep the rest.

---

## 7. Notes

- Shopify stays the source of truth for products; the DB caches products/variants and stores only what Shopify
  doesn't have (rates, pricing config, run history). Products deleted in Shopify disappear on the next sync.
- New variants added in Shopify show up after **Sync products** (store page) or **Refresh** (product page;
  a product is also re-pulled every time it is opened).
- Push jobs run in the Node process. On a VPS / `next start` that's fine for thousands of variants.
  On serverless (Vercel) long jobs can hit the function time limit — run it on a VPS, or trigger per product.
- Only one full-store update runs at a time per store.
- `SHOPIFY_BASE_URL_OVERRIDE` exists only for testing against a mock Shopify server — leave it unset in production.
