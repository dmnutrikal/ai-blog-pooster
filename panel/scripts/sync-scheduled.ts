// Scheduled translation sync: every store with "Автоматичен седмичен превод" on.
// Run by .github/workflows/translate.yml (weekly) or by hand: npm run sync:scheduled
//
// A store with writes enabled gets a real sync; one without gets a dry run whose
// proposals land as pending_review for the panel. One store failing never stops another.

import { runStoreSync } from "../src/lib/translate/run-sync";
import { storeRepository } from "../src/lib/stores/repository";

async function main() {
  const stores = (await storeRepository().list()).filter((s) => s.translateWeeklyEnabled);
  if (!stores.length) {
    console.log("No store has weekly translation enabled — nothing to do.");
    return;
  }

  let failures = 0;
  for (const store of stores) {
    const write = store.writesEnabled;
    console.log(`\n=== ${store.name} (${store.slug}) — ${write ? "sync + write" : "dry run (writes off)"} ===`);
    try {
      const { jobId, summary } = await runStoreSync(store, {
        dryRun: !write,
        triggeredBy: "schedule",
        log: (line) => console.log(line),
      });
      console.log(
        `Job #${jobId}: ${summary.translated} translated${write ? ` (${summary.written} written)` : " (proposals)"}, ` +
          `${summary.failed} failed, $${summary.usage.costUsd.toFixed(4)}`,
      );
    } catch (err) {
      failures++;
      console.error(`✗ ${store.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
