# madebynaturelabs

English-only B2B blog for Made By Nature Labs, a private-label / contract cosmetics
manufacturer. Uses the per-store flags in `src/config.js`:

| Flag (store.config.js) | Value | Effect |
| --- | --- | --- |
| `primaryLocale` / `secondaryLocale` | `'en'` / `null` | English article only, no translation registered |
| `catalog` | `{ enabled: true, source: 'csv' }` | Products come from `data/products.csv`, not the Shopify API; each article links the most relevant one |
| `linking` | `{ minLift: 0.09, liftRank: 30 }` | Extra match guard on top of `LINK_MIN_SIMILARITY` (see below) |
| `productLink` | `PRODUCT_LINK` (content.js) | B2B anchor pools with a `{product}` placeholder + claim-free display names |
| `image` | `{ mode: 'scene-only' }` | Text-only editorial scenes, no `products/` folder |
| `cta` | `{ anchorEn, leadInEn }` | Fixed B2B CTA to `B2B_CTA_URL_MADEBYNATURELABS` — **fallback only**, when an article has no product link (`src/steps/insertCta.js`) |
| `publishStatus` | `'published'` | Articles go live (visible) immediately |

Compliance profile: EU Regulation (EC) 1223/2009 + (EU) 655/2013 — see `regulatory.js`.

## Product linking

- `npm run import-products-csv` (with `STORE=madebynaturelabs`) embeds `Name + "\n" + Description`
  for every row of `data/products.csv` and upserts it into `products` keyed on (store, handle).
  `shopify_gid` is NOT NULL in that table, so CSV rows store `csv:<handle>`. Re-run it after
  replacing the CSV. `npm run sync-products` is a no-op for this store.
- A topic gets a product only if the best `match_products` result clears `LINK_MIN_SIMILARITY`
  (0.35) **and** beats the 30th-best product by `minLift` (0.09). Nearly every description ends
  in the same private-label / MOQ boilerplate, so generic B2B topics clear 0.35 against random
  products; the lift guard rejects those. No confident match → fixed CTA to `/collections/all`.
- The writer and anchors see `productDisplayName()` (content.js), which strips sizes and claim
  words (acne, rosacea, regenerating, repair, anti-age, natural...) from the product name. The
  link itself goes to the real product page. Product descriptions are never sent to the writer.

## Secrets (local `.env` and GitHub repository secrets — never commit)

- `SHOPIFY_STORE_DOMAIN_MADEBYNATURELABS`, `SHOPIFY_CLIENT_ID_MADEBYNATURELABS`,
  `SHOPIFY_CLIENT_SECRET_MADEBYNATURELABS` — required.
- `B2B_CTA_URL_MADEBYNATURELABS` — required (startup fails without it).
- `BLOG_GID_MADEBYNATURELABS` — the blog to publish into.

## Turning it on

1. Add the secrets above.
2. `STORE=madebynaturelabs npm run load-calendar` to load `data/calendar.json` into `topics`.
3. `STORE=madebynaturelabs npm run import-products-csv` to load the catalog.
4. The `run-pipeline-madebynaturelabs` job in `.github/workflows/autoblog.yml` runs daily
   (1 visible article). It skips itself until the required secrets exist; set the repository
   variable `MADEBYNATURELABS_AUTOBLOG=off` to pause it.
