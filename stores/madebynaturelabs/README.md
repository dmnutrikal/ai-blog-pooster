# madebynaturelabs — not wired up yet

Placeholder. This store is **not** runnable: the engine only loads a store when
`STORE=madebynaturelabs` is set, and it will fail at startup until the files below exist.
Nothing here is referenced by the CollagenLab pipeline.

## What this folder needs

| Path | What it is |
| --- | --- |
| `store.config.js` | Store id, the env-var NAMES holding this store's Shopify credentials / blog GID / public domain, and the fallback product handle. Copy `stores/collagenlab/store.config.js` as the template. **No secret values in this file — it is committed.** |
| `regulatory.js` | This store's approved claim wording. Must export the same named constants the engine imports (`APPROVED_VITAMIN_C_CLAIM_BG`, `APPROVED_VITAMIN_C_CLAIM_EN`) — see `stores/collagenlab/regulatory.js`. |
| `products/` | Product cutout PNGs for the featured image. `generateImage.js` globs `*.png` here; the filename becomes the flavor label (`Wild-Berries.png` -> "Wild Berries"). At least one file, or image generation falls back to a product-free lifestyle scene. |
| `data/` | `calendar.json` — the editorial calendar `loadCalendar.js` upserts into `topics`. Same record shape as `stores/collagenlab/data/calendar.json`. |
| `recipes/` | Optional. Recipe images, resolved as `config.store.paths.recipes`. Nothing reads this yet. |

## Secrets

Add this store's values to the environment (local `.env`, and GitHub repository
secrets for CI) under the var names declared in its `store.config.js` — e.g.
`BLOG_GID_MADEBYNATURELABS`. Never commit them.

## Turning it on

1. Fill in the files above.
2. Add the secrets.
3. Add an Actions job (or matrix entry) with `STORE: madebynaturelabs` in
   `.github/workflows/autoblog.yml`.
