import { config } from '../config.js';
import { DISCLAIMER_EN } from '../lib/storeRegulatory.js';
import { disclaimerMarker, insertBeforeDisclaimer } from './linkArticles.js';

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inserts the store's fixed call-to-action (store.config.js cta + the
// B2B_CTA_URL_<STORE> env var — see config.cta) as its own <p> right before
// the English disclaimer. Done in code, not via the writer prompt, so the
// wording and URL are exactly what the store configured. Runs before
// compliance.js so the audit covers it. No-op when the store has no cta.
export function insertCta(article) {
  const { cta } = config;
  if (!cta) return article;

  const leadIn = cta.leadInEn.trim();
  const link = `<a href="${escapeHtml(cta.url)}">${escapeHtml(cta.anchorEn)}</a>`;
  const snippet = `<p>${leadIn ? `${escapeHtml(leadIn)} ` : ''}${link}</p>`;

  return {
    ...article,
    body_en_html: insertBeforeDisclaimer(article.body_en_html, snippet, disclaimerMarker(DISCLAIMER_EN)),
  };
}
