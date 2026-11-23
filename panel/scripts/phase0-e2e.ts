// Phase 0 end-to-end check: token → locales → one product → translate the title → (write) → verify.
//
//   npm run phase0:e2e -- --locale de                         dry run on the latest active product
//   npm run phase0:e2e -- --store test-store --locale de      pick a store added in the panel
//   npm run phase0:e2e -- --locale de --product gid://shopify/Product/123
//   npm run phase0:e2e -- --locale de --write                 writes; needs "Разреши запис" on the store in the panel
//   add --record to save Shopify responses under fixtures/recorded/ for tests

import { parseArgs } from "node:util";
import { LATEST_ACTIVE_PRODUCT, SHOP_LOCALES, TRANSLATABLE_RESOURCE, TRANSLATIONS_REGISTER } from "../src/lib/shopify/operations";
import { ClaudeEngine } from "../src/lib/translate/claude";
import { contentKind, translateBatch } from "../src/lib/translate/pipeline";
import { connect } from "./_shared";

const { values: args } = parseArgs({
  options: {
    store: { type: "string" },
    locale: { type: "string" },
    product: { type: "string" },
    write: { type: "boolean", default: false },
    record: { type: "boolean", default: false },
  },
});

interface ShopLocale {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
}
interface TranslatableContent {
  key: string;
  value: string | null;
  digest: string | null;
  locale: string;
  type: string;
}
interface Translation {
  key: string;
  value: string | null;
  outdated: boolean;
  updatedAt: string | null;
}
interface TranslatableResourceData {
  translatableResource: {
    resourceId: string;
    translatableContent: TranslatableContent[];
    translations: Translation[];
  } | null;
}

const KEY = "title";

async function main() {
  const locale = args.locale;
  if (!locale) throw new Error("Pass --locale, e.g. --locale de");

  const { client, store, shop } = await connect({ store: args.store, record: args.record });

  // Locales
  const { shopLocales } = await client.request<{ shopLocales: ShopLocale[] }>(SHOP_LOCALES);
  const primary = shopLocales.find((l) => l.primary);
  console.log(`✓ Locales: ${shopLocales.map((l) => `${l.locale}${l.primary ? " (primary)" : ""}${l.published ? "" : " [unpublished]"}`).join(", ")}`);
  const target = shopLocales.find((l) => l.locale === locale);
  if (!target) throw new Error(`Locale "${locale}" is not enabled on ${shop}`);
  if (target.primary) throw new Error(`"${locale}" is the primary locale; pick a translation locale`);

  // Product
  let productId = args.product;
  let productUrl: string | null = null;
  if (!productId) {
    const { products } = await client.request<{ products: { nodes: { id: string; title: string; onlineStoreUrl: string | null }[] } }>(LATEST_ACTIVE_PRODUCT);
    const product = products.nodes[0];
    if (!product) throw new Error("No active product found");
    productId = product.id;
    productUrl = product.onlineStoreUrl;
  }
  console.log(`✓ Product ${productId}`);

  const read = async () => {
    const { translatableResource } = await client.request<TranslatableResourceData>(TRANSLATABLE_RESOURCE, { resourceId: productId, locale });
    if (!translatableResource) throw new Error(`${productId} has no translatable content`);
    const content = translatableResource.translatableContent.find((c) => c.key === KEY);
    if (!content?.value || !content.digest) throw new Error(`Product has no "${KEY}" to translate`);
    return {
      content: { ...content, value: content.value, digest: content.digest },
      existing: translatableResource.translations.find((t) => t.key === KEY),
    };
  };

  const { content, existing } = await read();
  const kind = contentKind(content.type);
  if (!kind) throw new Error(`Unsupported content type ${content.type} for "${KEY}"`);

  console.log(`\n  source (${content.locale}):    ${content.value}`);
  console.log(`  current (${locale}):   ${existing?.value ?? "—"}${existing?.outdated ? "  [outdated]" : ""}`);

  // Translate
  const engine = new ClaudeEngine();
  const { items, usage } = await translateBatch(engine, [{ id: KEY, text: content.value, kind, field: KEY }], {
    sourceLocale: primary?.locale ?? content.locale,
    targetLocale: locale,
    neverTranslate: (process.env.NEVER_TRANSLATE ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  const outcome = items[0]!;
  console.log(`  proposed (${locale}):  ${outcome.ok ? outcome.value : "✗ rejected"}`);
  console.log(`\n  ${usage.model}: ${usage.inputTokens} in / ${usage.outputTokens} out tokens, $${usage.costUsd.toFixed(6)}`);
  if (!outcome.ok) {
    for (const issue of outcome.issues) console.error(`  ✗ ${issue.code}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  // Write
  if (!args.write) {
    console.log("\nDry run: nothing written. Re-run with --write to save this translation.");
    return;
  }
  if (!store.writesEnabled) {
    throw new Error(`Writes are off for ${store.name}. Turn on "Разреши запис" on its page in the panel; the test store goes first.`);
  }

  // Backup of the previous value, until the translation_backups table is wired up in Phase 2.
  if (existing?.value) console.log(`  backup: previous ${locale} value was "${existing.value}"`);

  const result = await client.request<{
    translationsRegister: { userErrors: { field: string[] | null; message: string; code: string | null }[] };
  }>(TRANSLATIONS_REGISTER, {
    resourceId: productId,
    translations: [{ key: KEY, locale, value: outcome.value, translatableContentDigest: content.digest }],
  });
  const errors = result.translationsRegister.userErrors;
  if (errors.length) throw new Error(`translationsRegister: ${errors.map((e) => `${e.code ?? ""} ${e.message}`).join("; ")}`);
  console.log("✓ Written with translationsRegister");

  // Verify
  const after = await read();
  if (after.existing?.value !== outcome.value || after.existing.outdated) {
    throw new Error(`Read-back mismatch: got "${after.existing?.value}" (outdated: ${after.existing?.outdated})`);
  }
  console.log("✓ Read back from Shopify and matches");
  console.log(`\nCheck the storefront in ${locale}${productUrl ? `: ${productUrl} (switch language or open the ${locale} domain/subfolder)` : "."}`);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
