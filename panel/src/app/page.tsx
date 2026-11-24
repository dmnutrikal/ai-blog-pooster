import { storeRepository } from "@/lib/stores/repository";
import { pipelineStoreSlugs } from "@/lib/stores/pipeline";
import type { StoreRecord } from "@/lib/stores/types";
import { ConnectionBadge, formatDate } from "./ConnectionResult";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  let stores: StoreRecord[] = [];
  let loadError: string | undefined;
  try {
    stores = await storeRepository().list();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  const pipelineSlugs = pipelineStoreSlugs();
  const notInPanel = pipelineSlugs.filter((slug) => !stores.some((s) => s.slug === slug));

  return (
    <>
      <div className="page-head">
        <h1>Магазини</h1>
        <a className="btn btn-primary" href="/stores/new">
          Добави магазин
        </a>
      </div>

      {loadError && <p className="notice notice-err">{loadError}</p>}

      {notInPanel.length > 0 && !loadError && (
        <div className="card">
          <h2>От блог генератора, още не са в панела</h2>
          <p className="small muted">
            Тези магазини пускат статии с ключовете от GitHub secrets. Добавете ги тук, за да се управляват от панела. Блогът продължава да работи и докато не
            са добавени.
          </p>
          <div className="actions">
            {notInPanel.map((slug) => (
              <a key={slug} className="btn" href={`/stores/new?slug=${encodeURIComponent(slug)}`}>
                Добави {slug}
              </a>
            ))}
          </div>
        </div>
      )}

      {stores.length === 0 && !loadError ? (
        <div className="card">
          <p>Още няма магазини в панела.</p>
        </div>
      ) : (
        <div className="store-list">
          {stores.map((s) => (
            <a key={s.id} className="card store-card" href={`/stores/${s.id}`}>
              <h2>{s.name}</h2>
              <p className="muted small">
                {s.slug} · {s.shopDomain}
              </p>
              <p className="actions">
                <ConnectionBadge connection={s.connection ?? undefined} />
                {pipelineSlugs.includes(s.slug) &&
                  (s.autoblogEnabled ? <span className="badge badge-ok">Блог включен</span> : <span className="badge badge-muted">Блог спрян</span>)}
                {s.writesEnabled ? <span className="badge badge-warn">Запис на преводи</span> : <span className="badge badge-muted">Преводи: четене</span>}
              </p>
              {s.connection && (
                <p className="small muted">
                  {s.connection.locales.length} езика · тествано {formatDate(s.connection.testedAt)}
                </p>
              )}
            </a>
          ))}
        </div>
      )}
    </>
  );
}
