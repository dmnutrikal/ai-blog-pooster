import { notFound } from "next/navigation";
import { startTranslationSync } from "@/app/actions";
import { formatDate } from "@/app/ConnectionResult";
import { coverage, jobFailures, listJobs, type TranslationJob } from "@/lib/translate/db";
import { storeRepository } from "@/lib/stores/repository";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

const JOB_STATUS: Record<TranslationJob["status"], { label: string; badge: string }> = {
  queued: { label: "Чака", badge: "badge-muted" },
  running: { label: "Тече", badge: "badge-warn" },
  completed: { label: "Завършено", badge: "badge-ok" },
  failed: { label: "Грешка", badge: "badge-err" },
  cancelled: { label: "Отменено", badge: "badge-muted" },
};

export default async function TranslationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await storeRepository().get(id);
  if (!store) notFound();

  const [jobs, perLocale] = await Promise.all([listJobs(store.id, 10), coverage(store.id)]);
  const running = jobs[0]?.status === "running" ? jobs[0] : undefined;
  const lastFinished = jobs.find((j) => j.status !== "running");
  const failures = lastFinished && lastFinished.failed > 0 ? await jobFailures(lastFinished.id) : [];
  const locales = [...perLocale.keys()].sort();

  return (
    <>
      <AutoRefresh active={Boolean(running)} />
      <p className="small">
        <a href={`/stores/${store.id}`}>← {store.name}</a>
      </p>
      <div className="page-head">
        <h1>Преводи · {store.name}</h1>
        {store.writesEnabled ? <span className="badge badge-warn">Запис на преводи</span> : <span className="badge badge-muted">Само четене</span>}
      </div>

      <div className="card">
        <h2>Ръчно синхронизиране</h2>
        <p className="small muted">
          Обхожда продуктите, превежда липсващите и остарелите полета (заглавия, описания, SEO) към избраните езици и пази резервно копие преди
          всеки запис. Заключените преводи не се пипат; невалидните предложения не се записват.
        </p>
        {running ? (
          <p>
            <span className="badge badge-warn">Тече</span>{" "}
            <span className="small">
              {running.dry_run ? "пробно" : "със запис"} · {running.translated} преведени · {running.failed} отказани · ${Number(running.cost_usd).toFixed(4)}
            </span>
          </p>
        ) : (
          <form action={startTranslationSync.bind(null, store.id)}>
            <div className="grid">
              <div className="field">
                <label htmlFor="locales">Езици (празно = всички)</label>
                <input id="locales" name="locales" placeholder="de, fr" />
              </div>
              <div className="field">
                <label htmlFor="max">Макс. продукти (празно = всички)</label>
                <input id="max" name="max" type="number" min={1} placeholder="напр. 3 за проба" />
              </div>
            </div>
            <div className="actions">
              <button className="btn" type="submit" name="mode" value="dry">
                Пробно (без запис)
              </button>
              <button className="btn btn-danger" type="submit" name="mode" value="write" disabled={!store.writesEnabled} title={store.writesEnabled ? undefined : 'Включете "Разреши запис" на страницата на магазина'}>
                Синхронизирай и запиши
              </button>
              <button className="btn" type="submit" name="mode" value="adopt" title="Приема сегашното състояние на магазина за одобрена база; занапред се превежда само променено или ново съдържание. Не пише нищо в магазина.">
                Приеми сегашните преводи
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Покритие по език</h2>
        {locales.length === 0 ? (
          <p className="small muted">Още няма данни — пуснете пробно синхронизиране.</p>
        ) : (
          <ul className="rows">
            {locales.map((locale) => {
              const c = perLocale.get(locale)!;
              return (
                <li key={locale}>
                  <span>
                    <strong>{locale}</strong>
                  </span>
                  <span className="small">
                    <span className="badge badge-ok">{c.current} актуални</span>{" "}
                    {c.pending_review > 0 && <span className="badge badge-warn">{c.pending_review} чакат преглед</span>}{" "}
                    {c.failed > 0 && <span className="badge badge-err">{c.failed} отказани</span>}
                  </span>
                  <span className="small muted">
                    {c.outdated > 0 ? `${c.outdated} остарели · ` : ""}
                    {c.locked > 0 ? `${c.locked} заключени · ` : ""}
                    {c.missing > 0 ? `${c.missing} липсват` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Пускания</h2>
        {jobs.length === 0 ? (
          <p className="small muted">Още няма пускания.</p>
        ) : (
          <ul className="rows">
            {jobs.map((job) => (
              <li key={job.id}>
                <span>
                  {formatDate(job.created_at)}{" "}
                  <span className="muted small">
                    · {job.dry_run ? "пробно" : "запис"} · {job.triggered_by === "cli" ? "от терминала" : "от панела"}
                    {job.params.locales?.length ? ` · ${job.params.locales.join(", ")}` : ""}
                  </span>
                  {job.error && <span className="small" style={{ display: "block", color: "var(--err)" }}>{job.error}</span>}
                </span>
                <span>
                  <span className={`badge ${JOB_STATUS[job.status].badge}`}>{JOB_STATUS[job.status].label}</span>
                </span>
                <span className="small muted">
                  {job.translated} преведени · {job.failed} отказани · ${Number(job.cost_usd).toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {failures.length > 0 && (
        <div className="card">
          <h2>Отказани полета (последно пускане)</h2>
          <ul className="rows">
            {failures.map((f, i) => (
              <li key={i}>
                <span>
                  {f.label ?? "—"} <span className="muted small">· {f.key ?? "?"}</span>
                </span>
                <span className="small muted">{f.locale ?? ""}</span>
                <span className="small" style={{ color: "var(--err)" }}>{f.reason ?? f.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
