// Alias pages.
//
// A dated snapshot (`gpt-4-32k-0613`) folds into its canonical page, but people
// paste the dated id — it is what their code says. So every alias gets a real
// URL that resolves: canonical link to the page that owns the answer, `noindex`
// so the two never compete in the index, and an instant redirect for humans.
//
// Static-host-friendly by design: no server rule, no vercel.json redirect list
// that has to be regenerated whenever an alias is added.

import { modelFullLabel } from "../data/display.js";
import { SITE_NAME } from "../data/site.js";
import { absolute, modelPagePath } from "../data/urls.js";
import type { Model } from "../schema/model.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAliasPage(model: Model, alias: string, siteUrl: string): string {
  const target = absolute(siteUrl, modelPagePath(model));
  const who = escapeHtml(modelFullLabel(model));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(alias)} → ${who} · ${SITE_NAME}</title>
    <link rel="canonical" href="${target}" />
    <meta name="robots" content="noindex, follow" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="stylesheet" href="/assets/styles.css" />
  </head>
  <body class="bg-site text-slate-900">
    <main class="mx-auto max-w-2xl px-6 py-24 text-sm">
      <p>
        <code class="font-mono">${escapeHtml(alias)}</code> is an alias of
        <code class="font-mono">${escapeHtml(model.model)}</code>. Redirecting to
        <a class="text-accent" href="${target}">${who}</a>.
      </p>
    </main>
  </body>
</html>
`;
}
