import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Server-side client using the SECRET key — bypasses RLS. Never expose this
// client or its key to a browser context.
export const supabase = createClient(config.supabase.url, config.supabase.secretKey);
