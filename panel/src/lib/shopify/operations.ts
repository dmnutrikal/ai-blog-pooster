// All Admin GraphQL operations used by the app, pinned to SHOPIFY_API_VERSION.
// Each one is checked with the Shopify Dev validator before it lands here.

export const SHOP_LOCALES = /* GraphQL */ `
  query ShopLocales {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

// Connection test, step 1. Needs no scope: proves the token works.
export const SHOP_INFO = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
    }
  }
`;

// Connection test, step 2: locales with their storefront URLs (read_locales + read_markets).
// Without read_markets the test falls back to SHOP_LOCALES.
export const SHOP_LOCALES_WITH_URLS = /* GraphQL */ `
  query ShopLocalesWithUrls {
    shopLocales {
      locale
      name
      primary
      published
      marketWebPresences {
        rootUrls {
          locale
          url
        }
      }
    }
  }
`;

// Connection test, step 3: needs read_content; a store without it still connects.
export const STORE_BLOGS = /* GraphQL */ `
  query StoreBlogs {
    blogs(first: 50) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

export const LATEST_ACTIVE_PRODUCT = /* GraphQL */ `
  query LatestActiveProduct {
    products(first: 1, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        title
        handle
        onlineStoreUrl
      }
    }
  }
`;

export const TRANSLATABLE_RESOURCE = /* GraphQL */ `
  query TranslatableResource($resourceId: ID!, $locale: String!) {
    translatableResource(resourceId: $resourceId) {
      resourceId
      translatableContent {
        key
        value
        digest
        locale
        type
      }
      translations(locale: $locale) {
        key
        value
        outdated
        updatedAt
      }
    }
  }
`;

export const TRANSLATABLE_RESOURCES = /* GraphQL */ `
  query TranslatableResources($resourceType: TranslatableResourceType!, $first: Int!, $after: String) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
      nodes {
        resourceId
        translatableContent {
          key
          digest
          locale
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const TRANSLATIONS_REGISTER = /* GraphQL */ `
  mutation TranslationsRegister($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations {
        key
        locale
        value
        outdated
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

// One page of translatable resources with their content values and the state of one
// locale's translations. The sync walks this per target locale. Validated against 2026-10.
export const TRANSLATABLE_RESOURCES_SYNC = /* GraphQL */ `
  query TranslatableResourcesSync($resourceType: TranslatableResourceType!, $locale: String!, $first: Int!, $after: String) {
    translatableResources(resourceType: $resourceType, first: $first, after: $after) {
      nodes {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
          type
        }
        translations(locale: $locale) {
          key
          value
          outdated
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
