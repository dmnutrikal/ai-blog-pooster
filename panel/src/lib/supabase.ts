// Server-side Supabase client for the shared project (the blog pipeline uses the same one).
// The secret key bypasses RLS: never import this from a client component.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (panel/.env). They are the same values the blog pipeline uses.");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
