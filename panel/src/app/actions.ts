"use server";

// The panel listens on 127.0.0.1 only (see package.json) until Supabase Auth is added.
// Every action must check the session once auth exists.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { testConnection } from "@/lib/stores/connection";
import { credentialsFor, DuplicateStoreError, storeRepository } from "@/lib/stores/repository";
import type { ConnectionSnapshot } from "@/lib/stores/types";
import { normalizeShopDomain, TokenError } from "@/lib/shopify/token";

type Field = "slug" | "name" | "shopDomain" | "clientId" | "clientSecret" | "publicDomain" | "blogGid";

export interface StoreFormState {
  fieldErrors?: Partial<Record<Field, string>>;
  error?: string;
  connection?: ConnectionSnapshot;
}

const FormSchema = z.object({
  intent: z.enum(["test", "save"]),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Само малки латински букви, цифри и тире, напр. collagenlab"),
  name: z.string().trim().min(1, "Въведете име").max(100),
  shopDomain: z.string().trim().min(1, "Въведете myshopify домейна"),
  clientId: z.string().trim().min(1, "Въведете Client ID"),
  clientSecret: z.string().trim(),
  publicDomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .refine((v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Домейн като collagenlab.bg, без https://"),
  blogGid: z
    .string()
    .trim()
    .refine((v) => v === "" || /^gid:\/\/shopify\/Blog\/\d+$/.test(v), "Изберете блог от списъка"),
});

function revalidateStore(id: string) {
  revalidatePath("/");
  revalidatePath(`/stores/${id}`);
  revalidatePath(`/stores/${id}/blog`);
}

// Creates a store (storeId undefined) or updates one. An empty secret on update keeps the saved one.
export async function saveStore(storeId: string | undefined, _prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: StoreFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors };
  }
  const { intent, slug, name, clientId, clientSecret } = parsed.data;
  const publicDomain = parsed.data.publicDomain || null;
  const blogGid = parsed.data.blogGid || null;

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(parsed.data.shopDomain);
  } catch (err) {
    if (err instanceof TokenError) return { fieldErrors: { shopDomain: "Въведете домейн от вида xxx.myshopify.com, не публичния домейн" } };
    throw err;
  }

  const repo = storeRepository();
  const existing = storeId ? await repo.get(storeId) : undefined;
  if (storeId && !existing) return { error: "Магазинът не е намерен" };
  if (!existing && !clientSecret) return { fieldErrors: { clientSecret: "Въведете Client secret" } };

  const sameDomain = await repo.findByDomain(shopDomain);
  if (sameDomain && sameDomain.id !== storeId) return { fieldErrors: { shopDomain: `Този магазин вече е добавен като „${sameDomain.name}“` } };
  const sameSlug = await repo.findBySlug(slug);
  if (sameSlug && sameSlug.id !== storeId) return { fieldErrors: { slug: `Слъгът вече се ползва от „${sameSlug.name}“` } };

  const secret = clientSecret || credentialsFor(existing!).clientSecret;
  const connection = await testConnection({ shop: shopDomain, clientId, clientSecret: secret });

  if (intent === "test") return { connection };
  if (!connection.ok) return { connection, error: "Магазинът не е записан, защото връзката не работи." };
  if (blogGid && connection.blogs && !connection.blogs.some((b) => b.id === blogGid)) {
    return { connection, fieldErrors: { blogGid: "Този блог не съществува в магазина. Изберете от списъка." } };
  }

  let savedId: string;
  try {
    const fields = { slug, name, shopDomain, clientId, publicDomain, blogGid, connection };
    const saved = existing
      ? await repo.update(existing.id, { ...fields, ...(clientSecret ? { clientSecretEncrypted: encrypt(clientSecret) } : {}) })
      : await repo.create({ ...fields, clientSecretEncrypted: encrypt(clientSecret) });
    savedId = saved.id;
    await audit(saved.id, existing ? "store.updated" : "store.created", {
      slug,
      shopDomain,
      publicDomain,
      blogGid,
      secretChanged: Boolean(clientSecret),
    });
  } catch (err) {
    if (err instanceof DuplicateStoreError) {
      return { fieldErrors: err.field === "slug" ? { slug: "Слъгът вече се ползва" } : { shopDomain: "Този магазин вече е добавен" } };
    }
    throw err;
  }
  revalidateStore(savedId);
  redirect(`/stores/${savedId}`);
}

export async function retestStore(storeId: string): Promise<void> {
  const repo = storeRepository();
  const store = await repo.get(storeId);
  if (!store) return;
  const connection = await testConnection(credentialsFor(store));
  await repo.update(storeId, { connection });
  revalidateStore(storeId);
}

export async function setWritesEnabled(storeId: string, formData: FormData): Promise<void> {
  const writesEnabled = formData.get("writesEnabled") === "on";
  await storeRepository().update(storeId, { writesEnabled });
  await audit(storeId, "store.writes_enabled", { writesEnabled });
  revalidateStore(storeId);
}

export async function setAutoblogEnabled(storeId: string, formData: FormData): Promise<void> {
  const autoblogEnabled = formData.get("autoblogEnabled") === "on";
  await storeRepository().update(storeId, { autoblogEnabled });
  await audit(storeId, "store.autoblog_enabled", { autoblogEnabled });
  revalidateStore(storeId);
}

export async function deleteStore(storeId: string, formData: FormData): Promise<void> {
  if (formData.get("confirm") !== "on") return;
  const store = await storeRepository().get(storeId);
  await storeRepository().remove(storeId);
  await audit(null, "store.deleted", { slug: store?.slug, shopDomain: store?.shopDomain });
  revalidatePath("/");
  redirect("/");
}
