import { notFound } from "next/navigation";
import { setTranslateWeeklyEnabled, startTranslationSync } from "@/app/actions";
import { formatDate } from "@/app/ConnectionResult";
import { coverage, jobFailures, listJobs, type TranslationJob } from "@/lib/translate/db";
import { SYNC_GROUPS } from "@/lib/translate/resource-groups";
import { storeRepository } from "@/lib/stores/repository";
import { AutoRefresh } from "./AutoRefresh";

export const dynamic = "force-dynamic";

const JOB_STATUS: Record<TranslationJob["status"], { label: string; badge: string; rail: string }> = {
  queued: { label: "Чака", badge: "badge-muted", rail: "" },
  running: { label: "Тече", badge: "badge-warn", rail: "job-run" },
  completed: { label: "Завършено", badge: "badge-ok", rail: "job-ok" },
  failed: { label: "Грешка", badge: "badge-err", rail: "job-err" },
  cancelled: { label: "Отменено", badge: "badge-muted", rail: "" },
};

function jobKindLabel(job: TranslationJob): string {
  if (job.params.adopt) return "приемане на базата";
  return job.dry_run ? "пробно" : "запис";
}

function jobSourceLabel(job: TranslationJob): string {
  return job.triggered_by === "cli" ? "от терминала" : job.triggered_by === "schedule" ? "по график" : "от панела";
}

export default async function TranslationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await storeRepository().get(id);
  if (!store) notFound();

  const [jobs, perLocale] = await Promise.all([listJobs(store.id, 10), coverage(store.id)]);
  const running = jobs[0]?.status === "running" ? jobs[0] : undefined;
  const lastFinished = jobs.find((j) => j.status !== "running");
  const failures = lastFinished && lastFinished.failed > 0 ? await jobFailures(lastFinished.id) : [];
  const locales = [...perLocale.keys()].sort();

  const totals = { current: 0, pending_review: 0, failed: 0, locked: 0, rest: 0, all: 0 };
  for (const c of perLocale.values()) {
    totals.current += c.current;
    totals.pending_review += c.pending_review;
    totals.failed += c.failed;
    totals.locked += c.locked;
    totals.rest += c.missing + c.outdated;
    totals.all += c.current + c.pending_review + c.failed + c.locked + c.missing + c.outdated;
  }
  const pct = totals.all ? Math.round(((totals.current + totals.locked) / totals.all) * 100) : 0;

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

      <div className="stats">
        <div className="stat">
          <strong>{locales.length}</strong>езика
        </div>
        <div className="stat">
          <strong>{pct}%</strong>покритие
        </div>
        <div className="stat">
          <strong>{totals.current.toLocaleString("bg-BG")}</strong>актуални превода
        </div>
        <div className="stat">
          <strong>{totals.pending_review.toLocaleString("bg-BG")}</strong>чакат преглед
        </div>
        {totals.failed > 0 && (
          <div className="stat">
            <strong style={{ color: "var(--err)" }}>{totals.failed.toLocaleString("bg-BG")}</strong>отказани
          </div>
        )}
      </div>

      <div className="card">
        <h2>Ръчно синхронизиране</h2>
        <p className="small muted">
          Обхожда цялото преводимо съдържание — превежда липсващото и промененото към избраните езици, пази резервно копие преди всеки запис.
          Заключените преводи не се пипат; невалидните предложения не се записват.
        </p>
        {running ? (
          <p>
            <span className="badge badge-warn">Тече</span>{" "}
            <span className="small">
              {running.params.adopt
                ? `приемане на сегашните преводи (нищо не се превежда и записва) · ${running.translated} приети`
                : `${running.dry_run ? "пробно" : "със запис"} · ${running.translated} преведени · ${running.failed} отказани · $${Number(running.cost_usd).toFixed(4)}`}
            </span>
          </p>
        ) : (
          <form action={startTranslationSync.bind(null, store.id)}>
            <fieldset className="field" style={{ border: "none", padding: 0, margin: "0 0 0.75rem" }}>
              <legend className="small muted">Какво да се синхронизира — нищо избрано значи всичко</legend>
              <div className="chip-group">
                {SYNC_GROUPS.map((g) => (
                  <label className="chip-toggle" key={g.key}>
                    <input name="groups" value={g.key} type="checkbox" />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid" style={{ marginBottom: "0.25rem" }}>
              <div className="field">
                <label htmlFor="locales">Езици (празно = всички)</label>
                <input id="locales" name="locales" type="text" placeholder="de, fr" />
              </div>
              <div className="field">
                <label htmlFor="max">Макс. записи от тип (празно = всички)</label>
                <input id="max" name="max" type="number" min={1} placeholder="напр. 3 за проба" />
              </div>
            </div>
            <div className="actions">
              <button className="btn btn-primary" type="submit" name="mode" value="dry">
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
          <>
            <ul className="coverage">
              {locales.map((locale) => {
                const c = perLocale.get(locale)!;
                const all = c.current + c.pending_review + c.failed + c.locked + c.missing + c.outdated;
                const w = (n: number) => `${all ? (n / all) * 100 : 0}%`;
                const done = c.current + c.locked;
                return (
                  <li key={locale}>
                    <span className="locale">{locale}</span>
                    <span className="bar" title={`${done} актуални · ${c.pending_review} чакат преглед · ${c.failed} отказани · ${c.missing + c.outdated} оставащи`}>
                      <span className="seg-ok" style={{ width: w(c.current) }} />
                      <span className="seg-locked" style={{ width: w(c.locked) }} />
                      <span className="seg-warn" style={{ width: w(c.pending_review) }} />
                      <span className="seg-err" style={{ width: w(c.failed) }} />
                    </span>
                    <span className="coverage-nums">
                      {all ? Math.round((done / all) * 100) : 0}% · {done.toLocaleString("bg-BG")} от {all.toLocaleString("bg-BG")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="legend">
              <span><i style={{ background: "var(--ok)" }} />актуални</span>
              <span><i style={{ background: "var(--accent)" }} />заключени</span>
              <span><i style={{ background: "#d9a514" }} />чакат преглед</span>
              <span><i style={{ background: "var(--err)" }} />отказани</span>
            </p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Автоматичен седмичен превод</h2>
        <form action={setTranslateWeeklyEnabled.bind(null, store.id)}>
          <div className="toggle field">
            <input id="translateWeeklyEnabled" name="translateWeeklyEnabled" type="checkbox" defaultChecked={store.translateWeeklyEnabled} />
            <label htmlFor="translateWeeklyEnabled">
              Синхронизирай преводите веднъж седмично
              <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                Всеки понеделник сутрин преглежда магазина и превежда промененото и новото съдържание. При включен „Разреши запис“ записва направо;
                иначе оставя предложения за преглед тук. Изключено по подразбиране.
              </span>
            </label>
          </div>
          <button className="btn" type="submit">
            Запази
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Пускания</h2>
        {jobs.length === 0 ? (
          <p className="small muted">Още няма пускания.</p>
        ) : (
          <ul className="rows">
            {jobs.map((job) => (
              <li key={job.id} className={`job-row ${JOB_STATUS[job.status].rail}`}>
                <span>
                  {formatDate(job.created_at)}{" "}
                  <span className="muted small">
                    · {jobKindLabel(job)} · {jobSourceLabel(job)}
                    {job.params.locales?.length ? ` · ${job.params.locales.join(", ")}` : ""}
                  </span>
                  {job.error && <span className="small" style={{ display: "block", color: "var(--err)" }}>{job.error}</span>}
                </span>
                <span>
                  <span className={`badge ${JOB_STATUS[job.status].badge}`}>{JOB_STATUS[job.status].label}</span>
                </span>
                <span className="small muted mono">
                  {job.params.adopt
                    ? `${job.translated.toLocaleString("bg-BG")} приети`
                    : `${job.translated} преведени · ${job.failed} отказани · $${Number(job.cost_usd).toFixed(4)}`}
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
