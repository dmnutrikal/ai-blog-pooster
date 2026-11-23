// The blog pipeline's per-store folders (stores/<slug>/ at the repo root). A store in the panel
// runs blog articles when its slug matches one of these folders.

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function pipelineStoresDir(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.PIPELINE_STORES_DIR ?? join(process.cwd(), "..", "stores"));
}

export function pipelineStoreSlugs(dir: string = pipelineStoresDir()): string[] {
  // Read at request time from the repo checkout; not part of the build output.
  if (!existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(/*turbopackIgnore: true*/ join(dir, d.name, "store.config.js")))
    .map((d) => d.name)
    .sort();
}
