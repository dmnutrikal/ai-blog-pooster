// Store-wide product translation sync.
//
//   npm run sync -- --store collagenlab                       dry run, every published locale
//   npm run sync -- --store collagenlab --locale de,fr        only these locales
//   npm run sync -- --store collagenlab --max 3               first 3 products per locale
//   npm run sync -- --store collagenlab --locale de --write   writes; needs "Разреши запис" in the panel
//   npm run sync -- --store collagenlab --adopt               accept the store's current state as the
//                                                             baseline; later runs only pick up changes
//
// A dry run translates and stores proposals as pending_review in the shared database,
// but registers nothing to Shopify. Adopt translates nothing and writes nothing to Shopify.

import { parseArgs } from "node:util";
import { SYNC_GROUPS, typesForGroups } from "../src/lib/translate/resource-groups";
import { runStoreSync } from "../src/lib/translate/run-sync";
import { findStore } from "./_shared";

const { values: args } = parseArgs({
  options: {
    store: { type: "string" },
    locale: { type: "string" },
    // Group keys (products, collections, pages, blog, navigation, metaobjects, theme,
    // images, email, checkout) or raw TranslatableResourceType values. Default: everything.
    types: { type: "string" },
    max: { type: "string" },
    write: { type: "boolean", default: false },
    adopt: { type: "boolean", default: false },
  },
});

async function main() {
  const store = await findStore(args.store);
  const locales = args.locale
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const maxResources = args.max ? Number(args.max) : undefined;
  if (maxResources !== undefined && (!Number.isInteger(maxResources) || maxResources < 1)) throw new Error("--max expects a positive integer");

  if (args.write && args.adopt) throw new Error("--write and --adopt do not mix");
  let types: string[] | undefined;
  if (args.types) {
    const keys = args.types.split(",").map((s) => s.trim()).filter(Boolean);
    types = [...new Set(keys.flatMap((k) => (SYNC_GROUPS.some((g) => g.key === k) ? typesForGroups([k]) : [k.toUpperCase()])))];
  }
  console.log(`${args.adopt ? "Adopt current state" : args.write ? "SYNC (will write!)" : "Dry run"} on ${store.name}${locales ? ` → ${locales.join(", ")}` : ""}${maxResources ? ` (first ${maxResources} products)` : ""}`);

  const { jobId, summary } = await runStoreSync(store, {
    dryRun: !args.write,
    adopt: args.adopt,
    types,
    locales,
    maxResources,
    triggeredBy: "cli",
    log: (line) => console.log(line),
  });

  console.log(`\nJob #${jobId} done. Locales: ${summary.locales.join(", ") || "—"}`);
  console.log(`  fields scanned:     ${summary.scanned}`);
  console.log(`  needed translation: ${summary.queued}`);
  console.log(`  translated:         ${summary.translated}${args.write ? ` (written: ${summary.written})` : " (proposals, pending_review)"}`);
  console.log(`  failed validation:  ${summary.failed}`);
  console.log(`  locked, untouched:  ${summary.skippedLocked}`);
  if (summary.adopted) console.log(`  adopted as-is:      ${summary.adopted}`);
  if (summary.unsupported) console.log(`  unsupported types:  ${summary.unsupported} (generic JSON/lists — not translated)`);
  console.log(`  tokens: ${summary.usage.inputTokens} in / ${summary.usage.outputTokens} out · $${summary.usage.costUsd.toFixed(4)}`);
  if (!args.write) console.log("\nNothing was written. Re-run with --write after reviewing.");
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
