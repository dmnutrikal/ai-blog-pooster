// Stores live in the shared `stores` table, read by both the panel and the blog pipeline
// (src/config.js at the repo root).

import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "../crypto";
import type { ShopCredentials } from "../shopify/token";
import { supabase } from "../supabase";
import type { ConnectionSnapshot, StoreRecord } from "./types";

export type NewStore = Pick<StoreRecord, "slug" | "name" | "shopDomain" | "clientId" | "clientSecretEncrypted"> &
  Partial<Pick<StoreRecord, "publicDomain" | "blogGid" | "autoblogEnabled" | "connection">>;
export type StorePatch = Partial<Omit<StoreRecord, "id" | "createdAt" | "updatedAt">>;

export interface StoreRepository {
  list(): Promise<StoreRecord[]>;
  get(id: string): Promise<StoreRecord | undefined>;
  findBySlug(slug: string): Promise<StoreRecord | undefined>;
  findByDomain(shopDomain: string): Promise<StoreRecord | undefined>;
  create(store: NewStore): Promise<StoreRecord>;
  update(id: string, patch: StorePatch): Promise<StoreRecord>;
  remove(id: string): Promise<void>;
}

export class DuplicateStoreError extends Error {
  constructor(readonly field: "slug" | "shopDomain") {
    super(field === "slug" ? "A store with this slug already exists" : "This shop is already connected");
    this.name = "DuplicateStoreError";
  }
}

const COLUMNS =
  "id, slug, name, shop_domain, client_id, client_secret_encrypted, public_domain, blog_gid, autoblog_enabled, writes_enabled, connection, created_at, updated_at";

export interface StoreRow {
  id: string;
  slug: string;
  name: string;
  shop_domain: string;
  client_id: string;
  client_secret_encrypted: string;
  public_domain: string | null;
  blog_gid: string | null;
  autoblog_enabled: boolean;
  writes_enabled: boolean;
  connection: ConnectionSnapshot | null;
  created_at: string;
  updated_at: string;
}

export function fromRow(row: StoreRow): StoreRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shopDomain: row.shop_domain,
    clientId: row.client_id,
    clientSecretEncrypted: row.client_secret_encrypted,
    publicDomain: row.public_domain,
    blogGid: row.blog_gid,
    autoblogEnabled: row.autoblog_enabled,
    writesEnabled: row.writes_enabled,
    connection: row.connection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FIELD_TO_COLUMN: Record<keyof StorePatch, keyof StoreRow> = {
  slug: "slug",
  name: "name",
  shopDomain: "shop_domain",
  clientId: "client_id",
  clientSecretEncrypted: "client_secret_encrypted",
  publicDomain: "public_domain",
  blogGid: "blog_gid",
  autoblogEnabled: "autoblog_enabled",
  writesEnabled: "writes_enabled",
  connection: "connection",
};

export function toRow(patch: StorePatch): Partial<StoreRow> {
  const row: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined) row[FIELD_TO_COLUMN[field as keyof StorePatch]] = value;
  }
  return row as Partial<StoreRow>;
}

interface PgError {
  code?: string;
  message: string;
  details?: string | null;
}

// 23505 = unique_violation; the constraint name tells which column.
export function mapError(error: PgError): Error {
  if (error.code === "23505") {
    const text = `${error.message} ${error.details ?? ""}`;
    return new DuplicateStoreError(text.includes("slug") ? "slug" : "shopDomain");
  }
  if (error.code === "PGRST205" || error.code === "42P01") {
    return new Error("The stores table does not exist yet. Apply supabase/migrations/ to the shared Supabase project first.");
  }
  return new Error(`Supabase: ${error.message}`);
}

export class SupabaseStoreRepository implements StoreRepository {
  constructor(private readonly db: () => SupabaseClient = supabase) {}

  private async one(query: PromiseLike<{ data: unknown; error: PgError | null }>): Promise<StoreRecord | undefined> {
    const { data, error } = await query;
    if (error) throw mapError(error);
    return data ? fromRow(data as StoreRow) : undefined;
  }

  async list() {
    const { data, error } = await this.db().from("stores").select(COLUMNS).order("name");
    if (error) throw mapError(error);
    return (data as StoreRow[]).map(fromRow);
  }

  get(id: string) {
    return this.one(this.db().from("stores").select(COLUMNS).eq("id", id).maybeSingle());
  }

  findBySlug(slug: string) {
    return this.one(this.db().from("stores").select(COLUMNS).eq("slug", slug).maybeSingle());
  }

  findByDomain(shopDomain: string) {
    return this.one(this.db().from("stores").select(COLUMNS).eq("shop_domain", shopDomain).maybeSingle());
  }

  async create(store: NewStore) {
    const created = await this.one(this.db().from("stores").insert(toRow(store)).select(COLUMNS).single());
    return created!;
  }

  async update(id: string, patch: StorePatch) {
    const row = { ...toRow(patch), updated_at: new Date().toISOString() };
    const updated = await this.one(this.db().from("stores").update(row).eq("id", id).select(COLUMNS).maybeSingle());
    if (!updated) throw new Error(`Store ${id} not found`);
    return updated;
  }

  async remove(id: string) {
    const { error } = await this.db().from("stores").delete().eq("id", id);
    if (error) throw mapError(error);
  }
}

let repo: StoreRepository | undefined;
export function storeRepository(): StoreRepository {
  repo ??= new SupabaseStoreRepository();
  return repo;
}

// The only place in the panel a Client secret is decrypted.
export function credentialsFor(store: StoreRecord): ShopCredentials {
  return { shop: store.shopDomain, clientId: store.clientId, clientSecret: decrypt(store.clientSecretEncrypted) };
}
