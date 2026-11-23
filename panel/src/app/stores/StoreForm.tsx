"use client";

import { useActionState, useState } from "react";
import { saveStore, type StoreFormState } from "@/app/actions";
import { ConnectionResult } from "@/app/ConnectionResult";
import type { PublicStore } from "@/lib/stores/types";

interface Props {
  store?: PublicStore; // set when editing
  defaults?: { slug?: string; name?: string }; // prefill for a pipeline store not yet in the panel
  pipelineSlugs: string[];
}

// Controlled inputs, so the values survive the form reset React does after each action.
export function StoreForm({ store, defaults, pipelineSlugs }: Props) {
  const [state, formAction, pending] = useActionState<StoreFormState, FormData>(saveStore.bind(null, store?.id), {});
  const [slug, setSlug] = useState(store?.slug ?? defaults?.slug ?? "");
  const [name, setName] = useState(store?.name ?? defaults?.name ?? "");
  const [shopDomain, setShopDomain] = useState(store?.shopDomain ?? "");
  const [clientId, setClientId] = useState(store?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [publicDomain, setPublicDomain] = useState(store?.publicDomain ?? "");
  const [blogGid, setBlogGid] = useState(store?.blogGid ?? "");

  const err = state.fieldErrors ?? {};
  const blogs = state.connection?.blogs ?? store?.connection?.blogs;
  const hasPipelineFolder = pipelineSlugs.includes(slug);

  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor="name">Име</label>
        <input id="name" name="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="CollagenLab" autoComplete="off" />
        <p className="hint">Свободен текст, само за панела.</p>
        {err.name && <p className="error">{err.name}</p>}
      </div>

      <div className="field">
        <label htmlFor="slug">Слъг</label>
        <input
          id="slug"
          name="slug"
          type="text"
          list="pipeline-slugs"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="collagenlab"
          autoComplete="off"
          spellCheck={false}
        />
        <datalist id="pipeline-slugs">
          {pipelineSlugs.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p className="hint">
          {slug && hasPipelineFolder
            ? `Блогът ползва папката stores/${slug}/ и записите за „${slug}“ в базата.`
            : "Същото като папката на магазина в блог генератора (stores/<слъг>/). Без такава папка магазинът е само за преводи."}
        </p>
        {err.slug && <p className="error">{err.slug}</p>}
      </div>

      <div className="field">
        <label htmlFor="shopDomain">Shop domain</label>
        <input
          id="shopDomain"
          name="shopDomain"
          type="text"
          value={shopDomain}
          onChange={(e) => setShopDomain(e.target.value)}
          placeholder="collagen-lab.myshopify.com"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="hint">Домейнът xxx.myshopify.com, не публичният. Вижда се в Shopify admin → Settings → Domains.</p>
        {err.shopDomain && <p className="error">{err.shopDomain}</p>}
      </div>

      <div className="field">
        <label htmlFor="clientId">Client ID</label>
        <input id="clientId" name="clientId" type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} />
        <p className="hint">Shopify admin → Settings → Apps → вашият custom app → API credentials (или Dev Dashboard → app → Settings).</p>
        {err.clientId && <p className="error">{err.clientId}</p>}
      </div>

      <div className="field">
        <label htmlFor="clientSecret">Client secret</label>
        <input
          id="clientSecret"
          name="clientSecret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder={store ? "•••••••• запазен; оставете празно, за да не се сменя" : ""}
          autoComplete="new-password"
          spellCheck={false}
        />
        <p className="hint">Същото място като Client ID. Пази се криптиран и не се показва повече.</p>
        {err.clientSecret && <p className="error">{err.clientSecret}</p>}
      </div>

      <div className="field">
        <label htmlFor="publicDomain">Публичен домейн</label>
        <input
          id="publicDomain"
          name="publicDomain"
          type="text"
          value={publicDomain}
          onChange={(e) => setPublicDomain(e.target.value)}
          placeholder="collagenlab.bg"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="hint">Домейнът във връзките към статиите. Празно: остава стойността от настройките на блог генератора.</p>
        {err.publicDomain && <p className="error">{err.publicDomain}</p>}
      </div>

      <div className="field">
        <label htmlFor="blogGid">Блог за статиите</label>
        {blogs?.length ? (
          <select id="blogGid" name="blogGid" value={blogGid} onChange={(e) => setBlogGid(e.target.value)}>
            <option value="">— от настройките на блог генератора —</option>
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} (/blogs/{b.handle})
              </option>
            ))}
          </select>
        ) : (
          <>
            <input type="hidden" name="blogGid" value={blogGid} />
            <p className="hint" style={{ marginTop: 0 }}>
              {blogGid ? `Запазен: ${blogGid}. ` : ""}Списъкът с блогове се появява след „Тествай връзката“ (нужно е право read_content).
            </p>
          </>
        )}
        {err.blogGid && <p className="error">{err.blogGid}</p>}
      </div>

      {state.error && <p className="notice notice-err">{state.error}</p>}
      {state.connection && (
        <div className="card">
          <h2>Тест на връзката</h2>
          <ConnectionResult connection={state.connection} />
        </div>
      )}

      <div className="actions">
        <button className="btn" type="submit" name="intent" value="test" disabled={pending}>
          {pending ? "Проверявам…" : "Тествай връзката"}
        </button>
        <button className="btn btn-primary" type="submit" name="intent" value="save" disabled={pending}>
          {store ? "Запази промените" : "Запази магазина"}
        </button>
      </div>
      <p className="small muted">Записът първо тества връзката. Магазин без работеща връзка не се записва.</p>
    </form>
  );
}
