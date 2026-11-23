// Store-wide product translation sync.
//
//   npm run sync -- --store collagenlab                       dry run, every published locale
//   npm run sync -- --store collagenlab --locale de,fr        only these locales
//   npm run sync -- --store collagenlab --max 3               first 3 products per locale
//   npm run sync -- --store collagenlab --locale de --write   writes; needs "Разреши запис" in the panel
//
// A dry run translates and stores proposals as pending_review in the shared database,
// but registers nothing to Shopify.

import { parseArgs } from "node:util";
import { runStoreSync } from "../src/lib/translate/run-sync";
import { findStore } from "./_shared";

const { values: args } = parseArgs({
  options: {
    store: { type: "string" },
    locale: { type: "string" },
    max: { type: "string" },
    write: { type: "boolean", default: false },
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

  console.log(`${args.write ? "SYNC (will write!)" : "Dry run"} on ${store.name}${locales ? ` → ${locales.join(", ")}` : ""}${maxResources ? ` (first ${maxResources} products)` : ""}`);

  const { jobId, summary } = await runStoreSync(store, {
    dryRun: !args.write,
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
  console.log(`  tokens: ${summary.usage.inputTokens} in / ${summary.usage.outputTokens} out · $${summary.usage.costUsd.toFixed(4)}`);
  if (!args.write) console.log("\nNothing was written. Re-run with --write after reviewing.");
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
