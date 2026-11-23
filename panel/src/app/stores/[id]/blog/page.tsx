import { notFound } from "next/navigation";
import { addBlogTopics } from "@/app/actions";
import { formatDate } from "@/app/ConnectionResult";
import { blogSummary, highFlags, listArticles, listRuns, nextTopics, problemTopics, type BlogRun } from "@/lib/blog/queries";
import { storeRepository } from "@/lib/stores/repository";

export const dynamic = "force-dynamic";

const ARTICLE_STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: "Публикувана", badge: "badge-ok" },
  draft: { label: "Чернова", badge: "badge-muted" },
  blocked: { label: "Спряна от проверката", badge: "badge-err" },
};

const RUN_STATUS: Record<BlogRun["status"], { label: string; badge: string }> = {
  running: { label: "Тече", badge: "badge-warn" },
  completed: { label: "Завършено", badge: "badge-ok" },
  failed: { label: "Грешка", badge: "badge-err" },
  skipped: { label: "Блогът е спрян", badge: "badge-muted" },
};

const TRIGGER: Record<string, string> = { schedule: "по график", workflow_dispatch: "ръчно от GitHub", local: "локално" };

function adminArticleUrl(shopDomain: string, gid: string | null): string | null {
  const id = gid?.split("/").pop();
  return id ? `https://${shopDomain}/admin/articles/${id}` : null;
}

export default async function BlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await storeRepository().get(id);
  if (!store) notFound();

  const [summary, runs, upcoming, problems, articles] = await Promise.all([
    blogSummary(store.slug),
    listRuns(store.slug, 15),
    nextTopics(store.slug, 10),
    problemTopics(store.slug, 15),
    listArticles(store.slug, { limit: 40 }),
  ]);

  return (
    <>
      <p className="small">
        <a href={`/stores/${store.id}`}>← {store.name}</a>
      </p>
      <div className="page-head">
        <h1>Блог · {store.name}</h1>
        {store.autoblogEnabled ? <span className="badge badge-ok">Пуска по график</span> : <span className="badge badge-muted">Спрян в панела</span>}
      </div>

      <div className="stats">
        <div className="stat">
          <strong>{summary.articles.published}</strong>публикувани
        </div>
        <div className="stat">
          <strong>{summary.articles.draft}</strong>чернови
        </div>
        <div className="stat">
          <strong>{summary.articles.blocked}</strong>спрени от проверката
        </div>
        <div className="stat">
          <strong>{summary.topics.pending}</strong>теми чакат
        </div>
      </div>

      <nav className="tabs">
        <a className="btn" href="#runs">
          Пускания
        </a>
        <a className="btn" href="#topics">
          Теми
        </a>
        <a className="btn" href="#articles">
          Статии
        </a>
      </nav>

      <section className="card" id="runs">
        <h2>Пускания</h2>
        {runs.length === 0 ? (
          <p className="small muted">Още няма записани пускания. Записват се от първото пускане след обновяването на блог генератора.</p>
        ) : (
          <ul className="rows">
            {runs.map((r) => (
              <li key={r.id}>
                <span>
                  {formatDate(r.started_at)} <span className="muted small">· {TRIGGER[r.trigger ?? ""] ?? r.trigger}</span>
                  {r.items.map((item) => (
                    <span key={`${r.id}-${item.topic_id}`} className="small muted" style={{ display: "block" }}>
                      {item.keyword} — {item.status}
                      {item.error ? `: ${item.error}` : ""}
                    </span>
                  ))}
                  {r.error && <span className="small" style={{ display: "block", color: "var(--err)" }}>{r.error}</span>}
                </span>
                <span>
                  <span className={`badge ${RUN_STATUS[r.status].badge}`}>{RUN_STATUS[r.status].label}</span>
                </span>
                <span className="small">
                  {r.published} публ. · {r.drafted} черн. · {r.blocked} спр. · {r.errored} гр.
                  {r.github_run_url && (
                    <a style={{ display: "block" }} href={r.github_run_url} target="_blank" rel="noreferrer">
                      Лог в GitHub
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Добави заглавия за статии</h2>
        <p className="small muted">
          По едно заглавие на ред. Влизат в опашката като чакащи теми и блог генераторът пише статия по всяко от тях при следващите пускания.
        </p>
        <form action={addBlogTopics.bind(null, store.id)}>
          <div className="field">
            <label htmlFor="titles">Заглавия</label>
            <textarea id="titles" name="titles" rows={4} required placeholder={"Collagen and sleep quality\nWhy magnesium matters for recovery"} />
          </div>
          <div className="grid">
            <div className="field">
              <label htmlFor="titleMode">Как да се използват</label>
              <select id="titleMode" name="titleMode" defaultValue="keyword">
                <option value="keyword">Като теми — системата измисля заглавието</option>
                <option value="en">Точни заглавия (английски)</option>
                <option value="bg">Точни заглавия (български)</option>
              </select>
            </div>
            <div className="toggle field">
              <input id="priority" name="priority" type="checkbox" />
              <label htmlFor="priority">С предимство (пред всички чакащи)</label>
            </div>
          </div>
          <button className="btn" type="submit">
            Добави в опашката
          </button>
        </form>
      </section>

      <section className="card" id="topics">
        <h2>Следващи теми</h2>
        <p className="small muted">В реда, в който блог генераторът ще ги вземе: по приоритет, после най-старите.</p>
        <ul className="rows">
          {upcoming.map((t) => (
            <li key={t.id}>
              <span>
                {t.keyword}
                {t.angle && <span className="small muted" style={{ display: "block" }}>{t.angle}</span>}
              </span>
              <span className="small muted">приоритет {t.priority}</span>
              <span className="small muted">{t.pillar ?? ""}</span>
            </li>
          ))}
        </ul>

        {problems.length > 0 && (
          <>
            <h2 style={{ marginTop: "1.5rem" }}>Теми с проблем</h2>
            <ul className="rows">
              {problems.map((t) => (
                <li key={t.id}>
                  <span>
                    {t.keyword}
                    {t.last_error && <span className="small muted" style={{ display: "block" }}>{t.last_error}</span>}
                  </span>
                  <span>
                    <span className={`badge ${t.status === "blocked" ? "badge-err" : "badge-warn"}`}>{t.status === "blocked" ? "спряна" : "чака"}</span>
                  </span>
                  <span className="small muted">{t.attempts} опита</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card" id="articles">
        <h2>Последни статии</h2>
        <ul className="rows">
          {articles.map((a) => {
            const status = ARTICLE_STATUS[a.status] ?? { label: a.status, badge: "badge-muted" };
            const admin = adminArticleUrl(store.shopDomain, a.shopify_gid);
            const flags = highFlags(a);
            return (
              <li key={a.id}>
                <span>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      {a.title_en ?? a.title_bg ?? `Статия ${a.id}`}
                    </a>
                  ) : (
                    (a.title_en ?? a.title_bg ?? `Статия ${a.id}`)
                  )}
                  {a.title_en && a.title_bg && <span className="small muted" style={{ display: "block" }}>{a.title_bg}</span>}
                </span>
                <span>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  {flags > 0 && <span className="small" style={{ display: "block", color: "var(--err)" }}>{flags} сериозни бележки</span>}
                </span>
                <span className="small muted">
                  {formatDate(a.created_at)}
                  {admin && (
                    <a style={{ display: "block" }} href={admin} target="_blank" rel="noreferrer">
                      В Shopify admin
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
