// Everything the sync translates, grouped the way the panel shows it. Each group is a set
// of TranslatableResourceType values; "tier" picks the model (product pages carry health
// claims → the stronger tier, everything else → bulk).

import type { ModelKind } from "./factory";

export interface SyncGroup {
  key: string;
  label: string;
  types: string[];
  tier: ModelKind;
}

export const SYNC_GROUPS: SyncGroup[] = [
  { key: "products", label: "Продукти (вкл. опции)", types: ["PRODUCT", "PRODUCT_OPTION", "PRODUCT_OPTION_VALUE"], tier: "product" },
  { key: "collections", label: "Колекции и филтри", types: ["COLLECTION", "FILTER"], tier: "bulk" },
  { key: "pages", label: "Страници, политики и SEO на магазина", types: ["PAGE", "SHOP_POLICY", "SHOP"], tier: "bulk" },
  { key: "blog", label: "Блог (статии и заглавия)", types: ["BLOG", "ARTICLE"], tier: "bulk" },
  { key: "navigation", label: "Менюта и линкове", types: ["MENU", "LINK"], tier: "bulk" },
  { key: "metaobjects", label: "Метаобекти (секции и брандови текстове)", types: ["METAOBJECT"], tier: "bulk" },
  {
    key: "theme",
    label: "Тема (текстове на дизайна)",
    types: [
      "ONLINE_STORE_THEME",
      "ONLINE_STORE_THEME_APP_EMBED",
      "ONLINE_STORE_THEME_JSON_TEMPLATE",
      "ONLINE_STORE_THEME_LOCALE_CONTENT",
      "ONLINE_STORE_THEME_SECTION_GROUP",
      "ONLINE_STORE_THEME_SETTINGS_CATEGORY",
      "ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS",
    ],
    tier: "bulk",
  },
  { key: "images", label: "Alt текстове на изображения", types: ["MEDIA_IMAGE", "COLLECTION_IMAGE", "ARTICLE_IMAGE"], tier: "bulk" },
  { key: "email", label: "Имейл шаблони", types: ["EMAIL_TEMPLATE", "PACKING_SLIP_TEMPLATE"], tier: "bulk" },
  { key: "checkout", label: "Доставка, плащане и абонаменти", types: ["DELIVERY_METHOD_DEFINITION", "PAYMENT_GATEWAY", "SELLING_PLAN", "SELLING_PLAN_GROUP"], tier: "bulk" },
];

export const ALL_SYNC_TYPES = SYNC_GROUPS.flatMap((g) => g.types);

export function typesForGroups(groupKeys: string[]): string[] {
  return SYNC_GROUPS.filter((g) => groupKeys.includes(g.key)).flatMap((g) => g.types);
}

export function tierForType(resourceType: string): ModelKind {
  return SYNC_GROUPS.find((g) => g.types.includes(resourceType))?.tier ?? "bulk";
}
