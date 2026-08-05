import { supabase } from '../lib/supabase.js';

const STORE = 'collagenlab';

export async function countPendingTopics() {
  const { count, error } = await supabase
    .from('topics')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('store', STORE);

  if (error) {
    throw new Error(`Failed to count pending topics: ${error.message}`);
  }
  return count ?? 0;
}

export async function pickTopic() {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('status', 'pending')
    .eq('store', STORE)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to pick topic: ${error.message}`);
  }

  return data;
}
