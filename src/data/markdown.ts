// Every model page is also served as Markdown at /{provider}/{model}.md.
//
// An assistant asked "is gpt-4-32k deprecated" should be able to fetch one small
// document and get the answer, the dates, the successor and the citation without
// parsing a page of HTML. This is the same data the HTML renders, in the format
// a model reads best.

import { answerParagraph } from "./answer.js";
import { modelFullLabel, providerLabel } from "./display.js";
import { modelFaq } from "./faq.js";
import { replacementName, resolveReplacements } from "./replacements.js";
import { formatDate, lifecycle, relativeDays, STATUS_LABELS } from "./status.js";
import { absolute, modelPagePath, siblingModelUrl } from "./urls.js";
import { SIBLING_URL } from "./site.js";
import type { Model } from "../schema/model.js";

function factsTable(model: Model, today: string): string[] {
  const life = lifecycle(model, today);
  const rows: [string, string][] = [
    ["Provider", providerLabel(model.provider)],
    ["Model id", `\`${model.model}\``],
    ["Status", STATUS_LABELS[life.status]],
  ];
  if (model.aliases.length > 0) {
    rows.push(["Aliases", model.aliases.map((alias) => `\`${alias}\``).join(", ")]);
  }
  if (model.released_on) rows.push(["Released", formatDate(model.released_on)]);
  if (model.deprecated_on) rows.push(["Deprecated", formatDate(model.deprecated_on)]);
  if (life.shutdown) {
    const countdown =
      life.daysToShutdown === undefined ? "" : ` (${relativeDays(life.daysToShutdown)})`;
    rows.push([
      life.soft ? "Shutdown (earliest)" : "Shutdown",
      `${formatDate(life.shutdown)}${countdown}`,
    ]);
  }
  rows.push(["Last verified", formatDate(model.last_verified)]);

  return [
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([key, value]) => `| ${key} | ${value} |`),
  ];
}

function replacementSection(model: Model, catalog: Model[], siteUrl: string): string[] {
  const resolved = resolveReplacements(model, catalog);
  if (resolved.length === 0) return [];
  const lines = ["## Replacement", ""];
  for (const { ref, page } of resolved) {
    const name = replacementName(model, { ref, page });
    const link = page ? ` — ${absolute(siteUrl, modelPagePath(page))}` : "";
    lines.push(`- **${name}** (\`${ref.model}\`)${ref.recommended ? " · recommended" : ""}${link}`);
    if (ref.note) lines.push(`  - ${ref.note}`);
    lines.push(`  - Parameters it accepts: ${siblingModelUrl(SIBLING_URL, ref)}`);
  }
  const recommended = resolved.find((item) => item.ref.recommended) ?? resolved[0];
  if (recommended) {
    lines.push(
      "",
      "```diff",
      `- "model": "${model.model}"`,
      `+ "model": "${recommended.ref.model}"`,
      "```",
    );
  }
  lines.push("");
  return lines;
}

/** The full Markdown document for one model page. */
export function modelMarkdown(
  model: Model,
  catalog: Model[],
  siteUrl: string,
  today: string,
): string {
  const who = modelFullLabel(model);
  const lines: string[] = [
    `# ${who} — deprecation status`,
    "",
    `> ${answerParagraph(model, catalog, today)}`,
    "",
    model.description,
    "",
    "## Facts",
    "",
    ...factsTable(model, today),
    "",
    ...replacementSection(model, catalog, siteUrl),
  ];

  const faqs = modelFaq(model, catalog, today);
  if (faqs.length > 0) {
    lines.push("## FAQ", "");
    for (const faq of faqs) lines.push(`### ${faq.question}`, "", faq.answer, "");
  }

  if (model.sources.length > 0) {
    lines.push("## Sources", "");
    for (const source of model.sources) {
      lines.push(`- [${source.title ?? source.url}](${source.url}) — accessed ${source.accessed}`);
    }
    lines.push("");
  }

  lines.push(
    "---",
    "",
    `Canonical page: ${absolute(siteUrl, modelPagePath(model))}`,
    `JSON: ${absolute(siteUrl, `/api/v1/models/${model.provider}/${model.model}.json`)}`,
    "",
  );
  return lines.join("\n");
}
