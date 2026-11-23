import type { ConnectionSnapshot } from "@/lib/stores/types";

// Fixed time zone so server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat("bg-BG", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" });

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function ConnectionBadge({ connection }: { connection?: ConnectionSnapshot }) {
  if (!connection) return <span className="badge badge-muted">Не е тествана</span>;
  if (!connection.ok) return <span className="badge badge-err">Няма връзка</span>;
  if (connection.missingScopes.length) return <span className="badge badge-warn">Свързан, липсват права</span>;
  return <span className="badge badge-ok">Свързан</span>;
}

export function ConnectionResult({ connection }: { connection: ConnectionSnapshot }) {
  const primary = connection.locales.find((l) => l.primary);

  return (
    <section aria-live="polite">
      {connection.ok ? (
        <p className="notice notice-ok">
          Връзката работи{connection.shopName ? ` с „${connection.shopName}“` : ""}. Нищо не е записано в магазина.
        </p>
      ) : (
        <p className="notice notice-err">{connection.error}</p>
      )}

      {connection.warnings?.map((w) => (
        <p key={w} className="notice notice-warn small">
          {w}
        </p>
      ))}

      {connection.missingScopes.length > 0 && (
        <div className="notice notice-warn">
          <strong>Липсващи права за преводите:</strong>
          <ul className="chips">
            {connection.missingScopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="small" style={{ marginBottom: 0 }}>
            Блогът работи и без тях. За преводите: в настройките на app-а добавете правата (Dev Dashboard → Versions → нова версия → Release, или Admin API
            scopes при стар custom app) и одобрете ги в админа на магазина.
          </p>
        </div>
      )}

      {connection.grantedScopes.length > 0 && (
        <details className="field">
          <summary>Получени права ({connection.grantedScopes.length})</summary>
          <ul className="chips">
            {connection.grantedScopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      {connection.locales.length > 0 && (
        <>
          <p>
            Основен език: <strong>{primary ? `${primary.name} (${primary.locale})` : "—"}</strong> · {connection.locales.length} езика
          </p>
          <ul className="locales">
            {connection.locales.map((l) => (
              <li key={l.locale}>
                <span>
                  <strong>{l.name}</strong> <span className="muted">({l.locale})</span>
                </span>
                <span>
                  {l.primary ? (
                    <span className="badge badge-muted">основен</span>
                  ) : l.published ? (
                    <span className="badge badge-ok">Published</span>
                  ) : (
                    <span className="badge badge-warn">Unpublished</span>
                  )}
                </span>
                <span className="small muted">{l.urls.length ? l.urls.join(", ") : "без домейн"}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="small muted">Тествано: {formatDate(connection.testedAt)}</p>
    </section>
  );
}
