// Read access to the blog pipeline's tables (topics, articles, blog_runs) in the shared Supabase.
// The panel only reads them; the pipeline (src/ at the repo root) owns all writes.

import { supabase } from "../supabase";

export interface ComplianceFlag {
  severity: "high" | "medium" | "low";
  language?: string;
  quote?: string;
  reason?: string;
  rule?: string;
}

export interface Article {
  id: number;
  topic_id: number | null;
  title_en: string | null;
  title_bg: string | null;
  status: string; // published | draft | blocked
  url: string | null;
  shopify_gid: string | null;
  image_url: string | null;
  compliance_flags: ComplianceFlag[] | null;
  created_at: string;
}

export interface Topic {
  id: number;
  keyword: string;
  angle: string | null;
  status: string; // pending | published | blocked
  priority: number;
  attempts: number;
  last_error: string | null;
  pillar: string | null;
  created_at: string;
}

export interface BlogRun {
  id: number;
  status: "running" | "completed" | "failed" | "skipped";
  trigger: string | null;
  github_run_url: string | null;
  published: number;
  drafted: number;
  blocked: number;
  errored: number;
  items: { topic_id: number; keyword: string; status: string; shopify_gid?: string | null; error?: string }[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface BlogSummary {
  articles: Record<string, number>; // by status
  topics: Record<string, number>; // by status
  lastArticleAt: string | null;
}

const ARTICLE_STATUSES = ["published", "draft", "blocked"];
const TOPIC_STATUSES = ["pending", "published", "blocked"];

async function count(table: "articles" | "topics", store: string, status: string): Promise<number> {
  const { count: n, error } = await supabase().from(table).select("id", { count: "exact", head: true }).eq("store", store).eq("status", status);
  if (error) throw new Error(`Supabase ${table}: ${error.message}`);
  return n ?? 0;
}

export async function blogSummary(store: string): Promise<BlogSummary> {
  const [articleCounts, topicCounts, last] = await Promise.all([
    Promise.all(ARTICLE_STATUSES.map((s) => count("articles", store, s))),
    Promise.all(TOPIC_STATUSES.map((s) => count("topics", store, s))),
    supabase().from("articles").select("created_at").eq("store", store).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    articles: Object.fromEntries(ARTICLE_STATUSES.map((s, i) => [s, articleCounts[i]!])),
    topics: Object.fromEntries(TOPIC_STATUSES.map((s, i) => [s, topicCounts[i]!])),
    lastArticleAt: (last.data as { created_at: string } | null)?.created_at ?? null,
  };
}

export async function listArticles(store: string, options: { status?: string; limit?: number } = {}): Promise<Article[]> {
  let q = supabase()
    .from("articles")
    .select("id, topic_id, title_en, title_bg, status, url, shopify_gid, image_url, compliance_flags, created_at")
    .eq("store", store)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.status) q = q.eq("status", options.status);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase articles: ${error.message}`);
  return data as Article[];
}

// Same order as the pipeline's pickTopic(): highest priority first, then oldest.
export async function nextTopics(store: string, limit = 10): Promise<Topic[]> {
  const { data, error } = await supabase()
    .from("topics")
    .select("id, keyword, angle, status, priority, attempts, last_error, pillar, created_at")
    .eq("store", store)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Supabase topics: ${error.message}`);
  return data as Topic[];
}

// Topics that need attention: blocked, or pending with failed attempts.
export async function problemTopics(store: string, limit = 20): Promise<Topic[]> {
  const { data, error } = await supabase()
    .from("topics")
    .select("id, keyword, angle, status, priority, attempts, last_error, pillar, created_at")
    .eq("store", store)
    .or("status.eq.blocked,attempts.gt.0")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase topics: ${error.message}`);
  return data as Topic[];
}

// Empty when the blog_runs table doesn't exist yet or no run has been recorded.
export async function listRuns(store: string, limit = 20): Promise<BlogRun[]> {
  const { data, error } = await supabase()
    .from("blog_runs")
    .select("id, status, trigger, github_run_url, published, drafted, blocked, errored, items, error, started_at, finished_at")
    .eq("store", store)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (error.code === "PGRST205") return [];
    throw new Error(`Supabase blog_runs: ${error.message}`);
  }
  return data as BlogRun[];
}

export function highFlags(article: Pick<Article, "compliance_flags">): number {
  return (article.compliance_flags ?? []).filter((f) => f.severity === "high").length;
}
