import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { supabase } from '../lib/supabase.js';

const DEFAULT_STORE = 'collagenlab';
const DEFAULT_CALENDAR_PATH = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  '..',
  'data',
  'calendar.json'
);

// priority = 100000 - day, so day 1 (published first) gets the highest
// priority and every calendar row outranks the existing ad-hoc topic backlog
// (whose priority values are far below 100000).
function toRow(store, entry) {
  return {
    store,
    keyword: entry.keyphrase_bg,
    angle: entry.cluster_bg,
    fixed_title_bg: entry.title_bg,
    fixed_title_en: entry.title_en,
    intent: entry.intent,
    pillar: entry.pillar_bg,
    day: entry.day,
    status: 'pending',
    priority: 100000 - entry.day,
  };
}

// Reads the fixed editorial calendar (data/calendar.json) and upserts every
// record into `topics` for the given store. Values are passed as a
// parameterized row object to the Supabase client (never interpolated into a
// raw SQL string), so UTF-8 Bulgarian text with punctuation is handled safely.
// onConflict targets the (store, keyword) unique pair — DO UPDATE, so
// re-running the loader after editing calendar.json is idempotent.
export async function loadCalendar(store = DEFAULT_STORE, calendarPath = DEFAULT_CALENDAR_PATH) {
  const raw = await readFile(calendarPath, 'utf8');
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`No calendar entries found in ${calendarPath}`);
  }

  const rows = entries.map((entry) => toRow(store, entry));

  const { data, error } = await supabase
    .from('topics')
    .upsert(rows, { onConflict: 'store,keyword' })
    .select('id');

  if (error) {
    throw new Error(`Failed to upsert calendar topics: ${error.message}`);
  }

  return { total: rows.length, upserted: (data ?? []).length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? DEFAULT_STORE;

  // No explicit process.exit(0) on success — letting the event loop drain
  // naturally (like src/index.js does) avoids a flaky libuv assertion crash
  // seen on Windows/Node 24 when process.exit() races an in-flight fetch
  // socket teardown right after a Supabase call.
  loadCalendar(store)
    .then(({ total, upserted }) => {
      console.log(`Loaded calendar for store="${store}": ${total} record(s) read, ${upserted} row(s) upserted.`);
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
