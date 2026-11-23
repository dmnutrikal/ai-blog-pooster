// audit_log: every change to a store's settings. Best-effort — a failed write is logged, never thrown,
// so a missing table cannot block the panel.

import { supabase } from "./supabase";

// No login yet (panel binds to 127.0.0.1); becomes the signed-in user once Supabase Auth is in place.
const ACTOR = "panel";

export async function audit(storeId: string | null, action: string, details: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await supabase().from("audit_log").insert({ store_id: storeId, actor: ACTOR, action, details });
    if (error) console.warn(`audit_log: ${error.message}`);
  } catch (err) {
    console.warn(`audit_log: ${err instanceof Error ? err.message : String(err)}`);
  }
}
