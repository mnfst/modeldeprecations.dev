// The answer paragraph — the single most important string on the site.
//
// It is the sentence a search engine should lift into a featured snippet and
// the sentence an assistant should quote when someone asks "is X deprecated?".
// So it leads with the verdict ("Yes —" / "No —"), then the dates, then the
// replacement, and it never hedges beyond what the sources actually support.
//
// Pure function of (model, catalog, today): the same text backs the visible
// paragraph, the meta description, the JSON API, the Markdown view and the FAQ,
// so those four can never disagree with each other.

import { modelFullLabel, providerLabel } from "./display.js";
import { recommendedReplacement, replacementName } from "./replacements.js";
import { formatDate, lifecycle, relativeDays } from "./status.js";
import type { Model } from "../schema/model.js";

/** " The recommended replacement is GPT-5.6 Sol." */
function replacementClause(model: Model, catalog: Model[]): string {
  const recommended = recommendedReplacement(model, catalog);
  if (!recommended) return "";
  return ` The recommended replacement is ${replacementName(model, recommended)}.`;
}

/**
 * The equivalent clause for a model that is *not* going away.
 *
 * An active model can still list a successor — a newer, cheaper model worth
 * considering. Calling that "the recommended replacement" would imply the model
 * is being retired, which is the exact misreading this site exists to prevent.
 * So it is only stated when the provider actually flagged it, and it is phrased
 * as an option rather than a migration.
 */
function alternativeClause(model: Model, catalog: Model[]): string {
  const alternative = recommendedReplacement(model, catalog);
  if (!alternative) return "";
  const name = replacementName(model, alternative);
  return alternative.ref.recommended
    ? ` ${providerLabel(model.provider)} points new work at ${name}.`
    : ` ${name} is a newer alternative, but this model is not being retired.`;
}

// The subject is the bare model name, not the provider-qualified label: every
// answer names the provider in the very next clause, and "OpenAI GPT-4 32k is
// retired. OpenAI deprecated it…" reads like a template. The full label still
// leads the h1, the title and the OG card.

function retiredAnswer(model: Model, catalog: Model[], shutdown: string | undefined): string {
  const provider = providerLabel(model.provider);
  // A model can be known-retired without a recoverable date: providers delete
  // rows from their deprecation tables once a model is gone. Saying so is more
  // useful than implying the model still answers.
  if (!shutdown) {
    return `Yes — ${model.name} is retired and no longer served by ${provider}, which has not published the exact shutdown date.${replacementClause(model, catalog)}`;
  }
  const announced = model.deprecated_on
    ? `${provider} deprecated it on ${formatDate(model.deprecated_on)} and shut it down on ${formatDate(shutdown)}`
    : `${provider} shut it down on ${formatDate(shutdown)}`;
  return `Yes — ${model.name} is retired. ${announced}; API requests to it now fail.${replacementClause(model, catalog)}`;
}

function deprecatedAnswer(model: Model, catalog: Model[], today: string): string {
  const provider = providerLabel(model.provider);
  const life = lifecycle(model, today);

  if (!life.shutdown) {
    const when = model.deprecated_on ? ` on ${formatDate(model.deprecated_on)}` : "";
    return `Yes — ${provider} deprecated ${model.name}${when} but has not published a shutdown date. It still answers requests today.${replacementClause(model, catalog)}`;
  }

  const announced = model.deprecated_on ? ` on ${formatDate(model.deprecated_on)}` : "";
  const soft = life.soft ? "no sooner than " : "";
  const countdown =
    life.daysToShutdown === undefined ? "" : ` (${relativeDays(life.daysToShutdown)})`;
  return `Yes — ${provider} deprecated ${model.name}${announced} and shuts it down ${soft}on ${formatDate(life.shutdown)}${countdown}.${replacementClause(model, catalog)}`;
}

function activeAnswer(model: Model, catalog: Model[], today: string): string {
  const provider = providerLabel(model.provider);
  const life = lifecycle(model, today);
  const verdict = `No — ${model.name} is not deprecated as of ${formatDate(model.last_verified)}.`;

  if (!life.shutdown) {
    return `${verdict} ${provider} has announced neither a deprecation nor a shutdown date for it.${alternativeClause(model, catalog)}`;
  }
  const countdown =
    life.daysToShutdown === undefined ? "" : ` (${relativeDays(life.daysToShutdown)})`;
  const qualifier = life.soft
    ? `${provider} has not deprecated it, but publishes ${formatDate(life.shutdown)}${countdown} as the earliest date it could be retired`
    : `${provider} has scheduled its shutdown for ${formatDate(life.shutdown)}${countdown}`;
  return `${verdict} ${qualifier}.${alternativeClause(model, catalog)}`;
}

/**
 * The full answer paragraph for a model page. Two to three sentences, leading
 * with a literal Yes or No so the first four characters already answer the query.
 */
export function answerParagraph(model: Model, catalog: Model[], today: string): string {
  const life = lifecycle(model, today);
  if (life.status === "retired") return retiredAnswer(model, catalog, life.shutdown);
  if (life.status === "deprecated") return deprecatedAnswer(model, catalog, today);
  return activeAnswer(model, catalog, today);
}

/**
 * A compact answer that keeps the literal Yes/No lead. Used when the full
 * paragraph overflows the meta-description budget: the verdict is the part worth
 * protecting, so the supporting clauses are what get dropped.
 */
export function answerCompact(model: Model, catalog: Model[], today: string): string {
  const life = lifecycle(model, today);
  const provider = providerLabel(model.provider);
  const recommended = recommendedReplacement(model, catalog);
  const use = recommended ? ` Use ${recommended.ref.model}.` : "";

  if (life.status === "retired") {
    return `Yes — ${model.name} is retired${
      life.shutdown ? `: ${provider} shut it down on ${formatDate(life.shutdown)}` : ""
    }.${use}`;
  }
  if (life.status === "deprecated") {
    return `Yes — ${model.name} is deprecated${
      life.shutdown ? ` and shuts down ${formatDate(life.shutdown)}` : "; no shutdown date yet"
    }.${use}`;
  }
  return `No — ${model.name} is not deprecated${
    life.shutdown ? `, but shutdown is scheduled for ${formatDate(life.shutdown)}` : ""
  }.${recommended?.ref.recommended ? use : ""}`;
}

/**
 * A one-line version for table cells, llms.txt and the badge: the verdict and
 * the shutdown date, nothing else.
 */
export function answerHeadline(model: Model, today: string, short = false): string {
  const life = lifecycle(model, today);
  const who = short ? model.name : modelFullLabel(model);
  if (life.status === "retired") {
    return life.shutdown
      ? `${who} was retired on ${formatDate(life.shutdown)}.`
      : `${who} is retired.`;
  }
  if (life.status === "deprecated") {
    return life.shutdown
      ? `${who} is deprecated and shuts down on ${formatDate(life.shutdown)}.`
      : `${who} is deprecated; no shutdown date published yet.`;
  }
  return life.shutdown
    ? `${who} is active, with a shutdown scheduled for ${formatDate(life.shutdown)}.`
    : `${who} is not deprecated.`;
}
