import path from "node:path";
import ejs from "ejs";
import { answerCompact, answerHeadline, answerParagraph } from "../data/answer.js";
import { modelFullLabel, providerLabel } from "../data/display.js";
import { modelFaq } from "../data/faq.js";
import { VIEWS_DIR } from "../data/paths.js";
import { migrationChain, replacedBy, resolveReplacements } from "../data/replacements.js";
import { SIBLING_URL, SITE_NAME, SITE_URL } from "../data/site.js";
import { lifecycle } from "../data/status.js";
import {
  absolute,
  badgeJsonPath,
  modelJsonPath,
  modelMarkdownPath,
  modelPagePath,
  ogImagePath,
  providerPagePath,
  siblingModelUrl,
} from "../data/urls.js";
import { statusOn, type Model } from "../schema/model.js";
import { DESCRIPTION_MAX, fitText, fitTitle, truncate } from "./meta.js";
import { buildModelStructuredData } from "./structured-data.js";
import { hubLinks, renderShell, viewHelpers } from "./render.js";

/**
 * True when the display name already spells the API id — "GPT-4 32k" against
 * `gpt-4-32k`. Then the title only needs one of them. Anthropic's dated
 * snapshots are the case where it does not: nothing in "Claude Sonnet 3.5"
 * tells a search engine the page is about `claude-3-5-sonnet-20240620`.
 */
function nameSpellsTheId(model: Model): boolean {
  const bare = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return bare(model.name) === bare(model.model);
}

/**
 * Keyword-first title. The query is "<model> deprecated" or "<model> shutdown
 * date", so the model name leads and the two words that matter follow it. The
 * brand is the first thing dropped when a long model name needs the room.
 *
 * When the id is not recoverable from the name, the title carries both: the id
 * is what someone pastes into a search box, the name is what they recognise in
 * the result. If only one fits, the id wins, because the id is the query.
 */
export function modelPageTitle(model: Model, today: string): string {
  const status = statusOn(model, today);
  const who = model.name;
  const verdict = status === "active" ? "deprecated?" : "deprecation";
  if (nameSpellsTheId(model)) {
    return fitTitle([
      `${who} ${verdict} — shutdown date & replacement · ${SITE_NAME}`,
      `${who} ${verdict} — shutdown date & replacement`,
      `${who} ${verdict} — shutdown date`,
      `${who} ${verdict}`,
    ]);
  }
  return fitTitle([
    `${who} (${model.model}) ${verdict} — shutdown date`,
    `${who} (${model.model}) ${verdict}`,
    `${model.model} ${verdict} — shutdown date & replacement`,
    `${model.model} ${verdict} — shutdown date`,
    `${model.model} ${verdict}`,
  ]);
}

/**
 * The description is the answer paragraph — so the snippet Google shows and the
 * sentence on the page are the same sentence. When the full paragraph overflows
 * the budget it falls back to shorter *complete* phrasings rather than being cut
 * mid-clause; a snippet that trails off answers nothing.
 */
export function modelPageDescription(model: Model, catalog: Model[], today: string): string {
  const headline = answerHeadline(model, today);
  return fitText(
    [
      answerParagraph(model, catalog, today),
      answerCompact(model, catalog, today),
      headline,
      truncate(headline, DESCRIPTION_MAX),
    ],
    DESCRIPTION_MAX,
  );
}

export async function renderModelPage(
  model: Model,
  allModels: Model[],
  today: string,
): Promise<string> {
  const life = lifecycle(model, today);
  const faqs = modelFaq(model, allModels, today);
  const answer = answerParagraph(model, allModels, today);
  const replacements = resolveReplacements(model, allModels);
  const recommended = replacements.find((item) => item.ref.recommended) ?? replacements[0];

  const siblings = allModels
    .filter((other) => other.provider === model.provider && other.model !== model.model)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12);

  const body = await ejs.renderFile(path.join(VIEWS_DIR, "model.ejs"), {
    model,
    life,
    answer,
    faqs,
    replacements,
    recommended,
    chain: migrationChain(model, allModels, today),
    incoming: replacedBy(model, allModels),
    siblings,
    today,
    helpers: viewHelpers,
    providerName: providerLabel(model.provider),
    fullName: modelFullLabel(model),
    providerPath: providerPagePath(model.provider),
    jsonPath: modelJsonPath(model),
    markdownPath: modelMarkdownPath(model),
    badgePath: badgeJsonPath(model),
    siblingUrl: siblingModelUrl(SIBLING_URL, model),
    siblingUrlFor: (ref: { provider: string; model: string }): string =>
      siblingModelUrl(SIBLING_URL, ref),
    badgeMarkdown: `[![${model.model}](https://img.shields.io/endpoint?url=${SITE_URL}${badgeJsonPath(model)})](${SITE_URL}${modelPagePath(model)})`,
  });

  const description = modelPageDescription(model, allModels, today);
  return renderShell(
    {
      title: modelPageTitle(model, today),
      description,
      canonicalUrl: absolute(SITE_URL, modelPagePath(model)),
      ogImage: ogImagePath(modelPagePath(model)),
      ogType: "article",
      markdownUrl: modelMarkdownPath(model),
      structuredData: buildModelStructuredData(model, description, SITE_URL, faqs, today),
      providerHubs: hubLinks(allModels, today),
    },
    body,
  );
}
