# madebynaturelabs

English-only B2B blog for Made By Nature Labs, a private-label / contract cosmetics
manufacturer. Uses the per-store flags in `src/config.js`:

| Flag (store.config.js) | Value | Effect |
| --- | --- | --- |
| `primaryLocale` / `secondaryLocale` | `'en'` / `null` | English article only, no translation registered |
| `catalog` | `{ enabled: false }` | No product sync/matching/links; topics grounded in `content.js` `TOPIC_CONTEXT` |
| `image` | `{ mode: 'scene-only' }` | Text-only editorial scenes, no `products/` folder |
| `cta` | `{ anchorEn, leadInEn }` | Fixed B2B CTA inserted before the disclaimer (`src/steps/insertCta.js`) |
| `publishStatus` | `'draft'` | Articles created Hidden until approved |

Compliance profile: EU Regulation (EC) 1223/2009 + (EU) 655/2013 — see `regulatory.js`.

## Secrets (local `.env` and GitHub repository secrets — never commit)

- `SHOPIFY_STORE_DOMAIN_MADEBYNATURELABS`, `SHOPIFY_CLIENT_ID_MADEBYNATURELABS`,
  `SHOPIFY_CLIENT_SECRET_MADEBYNATURELABS` — required.
- `B2B_CTA_URL_MADEBYNATURELABS` — required (startup fails without it).
- `BLOG_GID_MADEBYNATURELABS` — optional; see the `BLOG_GID_TODO` in `store.config.js`.

## Turning it on

1. Add the secrets above and set the blog GID.
2. `STORE=madebynaturelabs npm run load-calendar` to load `data/calendar.json` into `topics`.
3. The `run-pipeline-madebynaturelabs` job in `.github/workflows/autoblog.yml` runs daily
   (1 Hidden article). It skips itself until the required secrets exist; set the repository
   variable `MADEBYNATURELABS_AUTOBLOG=off` to pause it.
