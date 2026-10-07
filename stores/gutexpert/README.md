# gutexpert

GutExpert (gutexpert.bg) — gut-focused food supplements. Selected with `STORE=gutexpert`.

**Bulgarian-primary**: the shop's base language is Bulgarian, so each article's
Bulgarian version goes in the main (canonical) Shopify article fields and the
English version is registered as its `en` translation (`primaryLocale: 'bg'`,
`secondaryLocale: 'en'`). collagenlab is the reverse.

| Path | What it is |
| --- | --- |
| `store.config.js` | Id, locales, env-var NAMES for the Shopify credentials, public domain + blog GID (hardcoded, not secrets), fallback product (`probiotic-complex`), and per-product anchor pools + claim-free display names (`productLink.byHandle`). |
| `regulatory.js` | Compliance profile. The ONLY approved claim is lactase in a lactose context (`APPROVED_LACTASE_CLAIM_*`); no benefit claims for probiotics / live cultures / CFU, butyrate/tributyrin or enzyme blends; on-pack phrases not echoed as claims; mandatory disclaimer. |
| `content.js` | Editorial voice: how prompts describe the store, link examples, topic-generator brief, image styling. |
| `products/` | Transparent bottle cutouts named by product **handle** (`probiotic-complex.png`, `multi-enzyme-complex.png`, `butyrate-tributyrin.png`, `lactase.png`). The featured image uses the cutout of the product the article links. |

No `data/calendar.json` — the backlog comes from the topic generator
(`STORE=gutexpert npm run generate-topics -- gutexpert --write`), and `npm run run`
tops it up automatically when fewer than `MIN_PENDING_TOPICS` are pending.

## Secrets

`SHOPIFY_STORE_DOMAIN_GUTEXPERT`, `SHOPIFY_CLIENT_ID_GUTEXPERT`,
`SHOPIFY_CLIENT_SECRET_GUTEXPERT` — in local `.env`, and as GitHub repository
secrets for the `run-pipeline-gutexpert` job in `.github/workflows/autoblog.yml`.
That job skips itself until all three secrets exist, and can be switched off with
the repository variable `GUTEXPERT_AUTOBLOG=off`.
