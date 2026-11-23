// Read-only. Counts resources and translatable keys per TranslatableResourceType, to compare with
// the numbers in T Lab (e.g. 158 articles, 6 pages, 3 309 Theme keys) and to map the
// ONLINE_STORE_THEME_* types to T Lab's rows (Theme, Customer accounts, Theme sections, Product templates).
//
//   npm run phase0:count
//   npm run phase0:count -- --store collagen-lab --type ARTICLE --type PAGE

import { parseArgs } from "node:util";
import { TRANSLATABLE_RESOURCES } from "../src/lib/shopify/operations";
import { TRANSLATABLE_RESOURCE_TYPES } from "../src/lib/shopify/resource-types";
import { connect } from "./_shared";

const { values: args } = parseArgs({
  options: {
    store: { type: "string" },
    type: { type: "string", multiple: true },
    record: { type: "boolean", default: false },
  },
});

interface Page {
  translatableResources: {
    nodes: { resourceId: string; translatableContent: { key: string }[] }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

async function main() {
  const { client } = await connect({ store: args.store, record: args.record });
  const types = args.type?.length ? args.type : [...TRANSLATABLE_RESOURCE_TYPES];

  for (const type of types) {
    let resources = 0;
    let keys = 0;
    let after: string | null = null;
    let error = "";
    try {
      do {
        const page: Page = await client.request<Page>(TRANSLATABLE_RESOURCES, { resourceType: type, first: 100, after }, 200);
        for (const node of page.translatableResources.nodes) {
          resources++;
          keys += node.translatableContent.length;
        }
        after = page.translatableResources.pageInfo.hasNextPage ? page.translatableResources.pageInfo.endCursor : null;
      } while (after);
    } catch (err) {
      error = `  ✗ ${err instanceof Error ? err.message : String(err)}`;
    }
    console.log(`${type.padEnd(44)} ${String(resources).padStart(6)} resources ${String(keys).padStart(7)} keys${error}`);
  }
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
