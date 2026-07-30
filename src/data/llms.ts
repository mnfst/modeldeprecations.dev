import { answerHeadline } from "./answer.js";
import { buildProviderFacets, upcomingShutdowns } from "./catalog.js";
import { modelFullLabel, providerLabel } from "./display.js";
import { recommendedReplacement } from "./replacements.js";
import { formatDate, lifecycle, relativeDays } from "./status.js";
import { REPO_URL, SIBLING_URL } from "./site.js";
import {
  CALENDAR_PATH,
  CHANGELOG_PATH,
  ICS_PATH,
  modelMarkdownPath,
  modelPagePath,
  providerPagePath,
  RSS_PATH,
} from "./urls.js";
import { modelId, type Model } from "../schema/model.js";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function guideIntro(siteUrl: string): string[] {
  return [
    "# How to use modeldeprecations.dev",
    "",
    `[modeldeprecations.dev](${siteUrl}) answers one question per model: is it deprecated,`,
    "when does it shut down, and what replaces it. Every date on the site is cited to the",
    "provider's own documentation, with the date we last checked it.",
    "",
    "Three lifecycle states are used, matching the providers' own vocabulary:",
    "",
    "- **active** — still supported, no deprecation announced.",
    "- **deprecated** — the provider has announced it is going away. It still answers requests.",
    "- **retired** — API access is gone. Requests fail.",
    "",
    "A model can be active *and* carry a shutdown date: Anthropic publishes a",
    '"not sooner than" date and Google publishes an earliest shutdown date for models',
    "that are current and fully supported. Those are reported as scheduled shutdowns,",
    "not deprecations, because that is what the provider actually committed to.",
    "",
  ];
}

function guideApi(siteUrl: string): string[] {
  return [
    "## Check one model",
    "",
    "```bash",
    `curl ${siteUrl}/api/v1/models/openai/gpt-4-32k.json`,
    "```",
    "",
    "Or fetch the page as Markdown, which includes the answer, the dates and the sources:",
    "",
    "```bash",
    `curl ${siteUrl}/openai/gpt-4-32k.md`,
    "```",
    "",
    "## Full catalog",
    "",
    "```bash",
    `curl ${siteUrl}/api/v1/models.json`,
    "```",
    "",
    "Ids are `provider/model`. Dated snapshots (`gpt-4-32k-0613`) are listed as aliases of",
    "their canonical entry rather than as separate records.",
    "",
    "Each entry carries `computed_status`, the lifecycle state recomputed against the build",
    "date — so a model whose shutdown has passed reads `retired` without anyone editing data.",
    "",
    "## Badges",
    "",
    "A shields.io endpoint per model, for READMEs that should go red when a model dies:",
    "",
    "```",
    `https://img.shields.io/endpoint?url=${siteUrl}/badge/openai/gpt-4-32k.json`,
    "```",
    "",
    "## Calendar and changelog",
    "",
    `- Subscribe to every shutdown date: ${siteUrl}${ICS_PATH}`,
    `- Changelog RSS: ${siteUrl}${RSS_PATH}`,
    "",
    "## JSON Schema",
    "",
    "```bash",
    `curl ${siteUrl}/api/v1/schema.json`,
    "```",
    "",
  ];
}

function guideAgents(siteUrl: string): string[] {
  return [
    "## Contribute",
    "",
    "Data lives in YAML under `models/{provider}/{model}.yaml` in the",
    `[GitHub repo](${REPO_URL}). Every lifecycle date needs a source URL; CI rejects a`,
    "date without one. Open a PR.",
    "",
    "## For agents",
    "",
    `- Machine-readable overview: ${siteUrl}/llms.txt`,
    `- This guide plus every model inline: ${siteUrl}/llms-full.txt`,
    "- Any page also exists as Markdown: append `.md` to a model URL.",
    "- In a browser, this site registers a **WebMCP** tool on `navigator.modelContext`:",
    "  `check_model_deprecation`, `list_shutdowns`, `find_replacement`, and `get_usage_guide`.",
    `- Parameters each model accepts are catalogued on the sibling site, ${SIBLING_URL}.`,
    "",
  ];
}

/** The canonical agent-facing doc: backs the "How to use" modal and llms-full.txt. */
export function usageGuideMarkdown(siteUrl: string): string {
  return [...guideIntro(siteUrl), ...guideApi(siteUrl), ...guideAgents(siteUrl)].join("\n");
}

/**
 * Concise, link-first overview following the llms.txt convention (llmstxt.org):
 * H1, blockquote summary, then sectioned lists of links agents can fetch.
 */
export function buildLlmsTxt(siteUrl: string, models: Model[], today: string): string {
  const upcoming = upcomingShutdowns(models, today).filter(
    (entry) => (entry.life.daysToShutdown ?? 0) >= 0,
  );

  const lines: string[] = [
    "# modeldeprecations.dev",
    "",
    "> An open, sourced catalog of AI model deprecations. For every model: is it deprecated,",
    "> when does it shut down, and what replaces it — each date cited to the provider's docs.",
    "",
    `Covering ${plural(models.length, "model")} across ${plural(
      buildProviderFacets(models, today).length,
      "provider",
    )}, as of ${today}.`,
    "",
    "## Next shutdowns",
  ];
  for (const { model, life } of upcoming.slice(0, 15)) {
    lines.push(
      `- [${modelId(model)}](${siteUrl}${modelPagePath(model)}): shuts down ${formatDate(
        life.shutdown,
      )}${life.daysToShutdown === undefined ? "" : ` (${relativeDays(life.daysToShutdown)})`}${
        life.soft ? ", earliest" : ""
      }.`,
    );
  }

  lines.push(
    "",
    "## API",
    `- [Full catalog](${siteUrl}/api/v1/models.json): every model, status, dates and successor in one file.`,
    `- [One model](${siteUrl}/api/v1/models/openai/gpt-4-32k.json): status, dates, replacement and sources.`,
    `- [JSON Schema](${siteUrl}/api/v1/schema.json): validates every entry.`,
    `- [Badge endpoint](${siteUrl}/badge/openai/gpt-4-32k.json): shields.io endpoint JSON per model.`,
    "",
    "## Feeds",
    `- [Shutdown calendar (.ics)](${siteUrl}${ICS_PATH}): subscribe to every announced shutdown date.`,
    `- [Changelog RSS](${siteUrl}${RSS_PATH}): every deprecation announcement and shutdown, dated.`,
    "",
    "## Guides",
    `- [Usage guide plus every model inline](${siteUrl}/llms-full.txt)`,
    "",
    "## Providers",
  );
  for (const facet of buildProviderFacets(models, today)) {
    lines.push(
      `- [${providerLabel(facet.provider)}](${siteUrl}${providerPagePath(facet.provider)}): ${
        facet.count
      } models — ${facet.active} active, ${facet.deprecated} deprecated, ${facet.retired} retired.`,
    );
  }

  lines.push("", "## Models");
  for (const model of models) {
    lines.push(
      `- [${modelId(model)}](${siteUrl}${modelMarkdownPath(model)}): ${answerHeadline(model, today)}`,
    );
  }
  lines.push(
    "",
    "## Optional",
    `- [GitHub repository](${REPO_URL}): source YAML, JSON Schema, contribution guide.`,
    `- [Shutdown calendar page](${siteUrl}${CALENDAR_PATH}) · [Changelog](${siteUrl}${CHANGELOG_PATH})`,
    `- [modelparams.dev](${SIBLING_URL}): which parameters each model accepts.`,
    "",
  );
  return lines.join("\n");
}

function modelSection(siteUrl: string, model: Model, catalog: Model[], today: string): string[] {
  const life = lifecycle(model, today);
  const recommended = recommendedReplacement(model, catalog);
  const lines = [
    `### ${modelId(model)}`,
    "",
    `${modelFullLabel(model)} — ${answerHeadline(model, today)}`,
    "",
    `- Status: ${life.status}`,
  ];
  if (model.aliases.length > 0) lines.push(`- Aliases: ${model.aliases.join(", ")}`);
  if (model.released_on) lines.push(`- Released: ${model.released_on}`);
  if (model.deprecated_on) lines.push(`- Deprecated: ${model.deprecated_on}`);
  if (life.shutdown) {
    lines.push(`- Shutdown${life.soft ? " (earliest)" : ""}: ${life.shutdown}`);
  }
  if (recommended) lines.push(`- Replacement: ${recommended.ref.model}`);
  for (const source of model.sources) lines.push(`- Source: ${source.url} (${source.accessed})`);
  lines.push(`- Page: ${siteUrl}${modelPagePath(model)}`, "", model.description, "");
  return lines;
}

/** The complete agent payload: the usage guide plus every model inline. */
export function buildLlmsFullTxt(siteUrl: string, models: Model[], today: string): string {
  const lines: string[] = [
    usageGuideMarkdown(siteUrl).trimEnd(),
    "",
    "---",
    "",
    "# Full catalog",
    "",
    `${plural(models.length, "model")}, grouped by provider, as of ${today}.`,
    "",
  ];
  for (const facet of buildProviderFacets(models, today)) {
    lines.push(`## ${providerLabel(facet.provider)}`, "");
    for (const model of models.filter((entry) => entry.provider === facet.provider)) {
      lines.push(...modelSection(siteUrl, model, models, today));
    }
  }
  return lines.join("\n");
}
