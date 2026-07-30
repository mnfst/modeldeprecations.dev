// Data-driven FAQ for a model page. Pure function of the entry so it backs both
// the visible Q&A and the FAQPage JSON-LD without the two drifting apart. The
// questions are the ones people actually type — "when will X shut down", "what
// replaces X", "is X still available" — and every answer is derived from data
// that has a source behind it.

import { modelFullLabel, providerLabel } from "./display.js";
import { recommendedReplacement, replacementName } from "./replacements.js";
import { formatDate, lifecycle, relativeDays } from "./status.js";
import type { Model } from "../schema/model.js";

export interface ModelFaq {
  question: string;
  answer: string;
}

function shutdownFaq(model: Model, today: string): ModelFaq | undefined {
  const who = modelFullLabel(model);
  const life = lifecycle(model, today);
  const provider = providerLabel(model.provider);

  if (life.status === "retired") {
    return life.shutdown
      ? {
          question: `When did ${who} shut down?`,
          answer: `${who} shut down on ${formatDate(life.shutdown)}. API requests to it fail from that date onward.`,
        }
      : undefined;
  }
  if (!life.shutdown) {
    return life.status === "deprecated"
      ? {
          question: `When will ${who} shut down?`,
          answer: `${provider} has deprecated ${who} but has not published a shutdown date. Treat it as at risk and plan a migration.`,
        }
      : undefined;
  }
  const hedge = life.soft
    ? ` ${provider} publishes this as the earliest possible retirement date rather than a firm commitment, so it may move later — but not earlier.`
    : "";
  return {
    question: `When will ${who} shut down?`,
    answer: `${who} is scheduled to shut down on ${formatDate(life.shutdown)}${
      life.daysToShutdown === undefined ? "" : `, ${relativeDays(life.daysToShutdown)}`
    }.${hedge}`,
  };
}

function replacementFaq(model: Model, catalog: Model[]): ModelFaq | undefined {
  const recommended = recommendedReplacement(model, catalog);
  if (!recommended) return undefined;
  const who = modelFullLabel(model);
  const name = replacementName(model, recommended);
  const note = recommended.ref.note ? ` ${recommended.ref.note}` : "";
  return {
    question: `What replaces ${who}?`,
    answer: `${providerLabel(model.provider)} recommends ${name} (\`${recommended.ref.model}\`) as the replacement for ${who}.${note}`,
  };
}

function availabilityFaq(model: Model, today: string): ModelFaq {
  const who = modelFullLabel(model);
  const life = lifecycle(model, today);
  if (life.status === "retired") {
    return {
      question: `Is ${who} still available?`,
      answer: `No. ${who} is retired and no longer served${
        life.shutdown ? ` — it was shut down on ${formatDate(life.shutdown)}` : ""
      }. Calls to it return an error.`,
    };
  }
  if (life.status === "deprecated") {
    return {
      question: `Is ${who} still available?`,
      answer: `Yes, for now. ${who} is deprecated but still answers requests${
        life.shutdown ? ` until ${formatDate(life.shutdown)}` : ""
      }. Deprecated models get no further updates and are the first to lose capacity.`,
    };
  }
  return {
    question: `Is ${who} still available?`,
    answer: `Yes. ${who} is active and fully supported as of ${formatDate(model.last_verified)}.`,
  };
}

function migrationFaq(model: Model, catalog: Model[]): ModelFaq | undefined {
  const recommended = recommendedReplacement(model, catalog);
  if (!recommended) return undefined;
  const who = modelFullLabel(model);
  const target = recommended.ref.model;
  return {
    question: `How do I migrate from ${who} to ${target}?`,
    answer: `Swap the model id in your API call: replace "${model.model}" with "${target}". ${
      recommended.ref.note ??
      "Keep the rest of the request the same, then re-check the parameters the new model accepts before you ship."
    }`,
  };
}

function aliasFaq(model: Model): ModelFaq | undefined {
  if (model.aliases.length === 0) return undefined;
  const who = modelFullLabel(model);
  const list = model.aliases.map((alias) => `\`${alias}\``).join(", ");
  return {
    question: `Does this apply to ${model.aliases[0]} too?`,
    answer: `Yes. ${who} is also published as ${list}; ${
      model.aliases.length === 1 ? "that id shares" : "those ids share"
    } the same lifecycle dates as \`${model.model}\`.`,
  };
}

const MAX_FAQS = 5;

/** Up to five Q&A pairs, ordered so the highest-intent question comes first. */
export function modelFaq(model: Model, catalog: Model[], today: string): ModelFaq[] {
  const candidates = [
    shutdownFaq(model, today),
    replacementFaq(model, catalog),
    availabilityFaq(model, today),
    migrationFaq(model, catalog),
    aliasFaq(model),
  ];
  return candidates.filter((faq): faq is ModelFaq => Boolean(faq)).slice(0, MAX_FAQS);
}
