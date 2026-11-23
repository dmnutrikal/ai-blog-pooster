// Run history for the panel (table blog_runs). Strictly best-effort: a failed write is logged
// once and never affects the run, so the pipeline works the same before the table exists.

import { supabase } from './supabase.js';

let warned = false;
function warn(action, error) {
  if (warned) return;
  warned = true;
  console.warn(`  (run history: could not ${action} blog_runs — ${error.message ?? error}; continuing)`);
}

function githubRunUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
}

// Returns the run id, or null when the row could not be written.
export async function startRun({ store, articlesPerRun, status = 'running' }) {
  try {
    const { data, error } = await supabase
      .from('blog_runs')
      .insert({
        store,
        status,
        trigger: process.env.GITHUB_EVENT_NAME ?? 'local',
        github_run_url: githubRunUrl(),
        articles_per_run: articlesPerRun,
        ...(status === 'running' ? {} : { finished_at: new Date().toISOString() }),
      })
      .select('id')
      .single();
    if (error) {
      warn('insert into', error);
      return null;
    }
    return data.id;
  } catch (err) {
    warn('insert into', err);
    return null;
  }
}

export async function finishRun(runId, { status, tally, items, error }) {
  if (!runId) return;
  try {
    const { error: updateError } = await supabase
      .from('blog_runs')
      .update({
        status,
        published: tally.published,
        drafted: tally.draft,
        blocked: tally.blocked,
        errored: tally.errored,
        items,
        error: error ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    if (updateError) warn('update', updateError);
  } catch (err) {
    warn('update', err);
  }
}
