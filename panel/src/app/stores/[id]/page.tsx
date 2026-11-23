import { notFound } from "next/navigation";
import { deleteStore, retestStore, setAutoblogEnabled, setWritesEnabled } from "@/app/actions";
import { ConnectionBadge, ConnectionResult, formatDate } from "@/app/ConnectionResult";
import { blogSummary } from "@/lib/blog/queries";
import { pipelineStoreSlugs } from "@/lib/stores/pipeline";
import { storeRepository } from "@/lib/stores/repository";
import { toPublic } from "@/lib/stores/types";
import { StoreForm } from "../StoreForm";

export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await storeRepository().get(id);
  if (!record) notFound();
  const store = toPublic(record);
  const pipelineSlugs = pipelineStoreSlugs();
  const hasBlog = pipelineSlugs.includes(store.slug);
  const summary = hasBlog ? await blogSummary(store.slug) : undefined;

  return (
    <>
      <div className="page-head">
        <h1>{store.name}</h1>
        <ConnectionBadge connection={store.connection ?? undefined} />
      </div>
      <p className="muted">
        {store.slug} · {store.shopDomain}
        {store.publicDomain ? ` · ${store.publicDomain}` : ""}
      </p>

      <div className="card">
        <h2>Блог</h2>
        {hasBlog && summary ? (
          <>
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
            <p className="small muted">Последна статия: {summary.lastArticleAt ? formatDate(summary.lastArticleAt) : "—"}</p>
            <form action={setAutoblogEnabled.bind(null, store.id)}>
              <div className="toggle field">
                <input id="autoblogEnabled" name="autoblogEnabled" type="checkbox" defaultChecked={store.autoblogEnabled} />
                <label htmlFor="autoblogEnabled">
                  Пускай статии по график
                  <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                    Изключено: ежедневното пускане за този магазин приключва, без да прави нищо. Задачата в GitHub Actions също трябва да е включена — ако там е
                    спряна, този ключ сам не я пуска.
                  </span>
                </label>
              </div>
              <div className="actions">
                <button className="btn" type="submit">
                  Запази
                </button>
                <a className="btn" href={`/stores/${store.id}/blog`}>
                  Статии, теми и пускания
                </a>
              </div>
            </form>
          </>
        ) : (
          <p className="small muted">
            Няма папка stores/{store.slug}/ в блог генератора, затова за този магазин не се пускат статии. Магазинът се ползва само за преводи.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Връзка</h2>
        {store.connection ? <ConnectionResult connection={store.connection} /> : <p>Връзката още не е тествана.</p>}
        <form action={retestStore.bind(null, store.id)}>
          <button className="btn" type="submit">
            Тествай отново
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Запис на преводи</h2>
        <form action={setWritesEnabled.bind(null, store.id)}>
          <div className="toggle field">
            <input id="writesEnabled" name="writesEnabled" type="checkbox" defaultChecked={store.writesEnabled} />
            <label htmlFor="writesEnabled">
              Разреши запис на преводи в този магазин
              <span className="small muted" style={{ display: "block", fontWeight: 400 }}>
                Без него преводните задачи само четат и показват какво биха променили. Не засяга блога.
              </span>
            </label>
          </div>
          <button className="btn" type="submit">
            Запази
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Данни за връзката</h2>
        <StoreForm store={store} pipelineSlugs={pipelineSlugs} />
      </div>

      <div className="card">
        <h2>Премахни магазина</h2>
        <form action={deleteStore.bind(null, store.id)}>
          <p className="small muted">
            Премахва магазина и ключовете му от панела. Статиите, темите и преводите не се трият.
            {hasBlog ? " Блогът се връща към ключовете в GitHub secrets; ако те вече са изтрити, ежедневното пускане ще спре с грешка." : ""}
          </p>
          <div className="toggle field">
            <input id="confirm" name="confirm" type="checkbox" required />
            <label htmlFor="confirm">Потвърждавам</label>
          </div>
          <button className="btn btn-danger" type="submit">
            Премахни
          </button>
        </form>
      </div>
    </>
  );
}
