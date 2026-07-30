// Resolving a replacement reference to the page it points at, and walking the
// chain when a model's successor has itself been deprecated — which happens
// constantly (o1 → gpt-5.6-sol, but gpt-5 → gpt-5.6-sol via a retired snapshot)
// and is exactly the question a reader lands on this site with.

import { modelFullLabel, providerLabel } from "./display.js";
import { modelId, statusOn, type Model, type Replacement } from "../schema/model.js";

export interface ResolvedReplacement {
  ref: Replacement;
  /** The page for this replacement, when the site has one. */
  page?: Model;
}

function findPage(
  catalog: Model[],
  ref: Pick<Replacement, "provider" | "model">,
): Model | undefined {
  const wanted = `${ref.provider}/${ref.model}`;
  return catalog.find((model) => modelId(model) === wanted);
}

export function resolveReplacements(model: Model, catalog: Model[]): ResolvedReplacement[] {
  return model.replacements.map((ref) => ({ ref, page: findPage(catalog, ref) }));
}

/** The successor the provider itself names, or the only one listed. */
export function recommendedReplacement(
  model: Model,
  catalog: Model[],
): ResolvedReplacement | undefined {
  const resolved = resolveReplacements(model, catalog);
  return resolved.find((item) => item.ref.recommended) ?? resolved[0];
}

/**
 * Follow recommended replacements until reaching a model that is still active
 * on `today` — the honest end of a migration path. Stops on a cycle, on a
 * replacement with no page here, and after `maxHops` so a data error can never
 * hang the build.
 */
export function migrationChain(
  model: Model,
  catalog: Model[],
  today: string,
  maxHops = 6,
): Model[] {
  const chain: Model[] = [];
  const seen = new Set<string>([modelId(model)]);
  let current = model;

  for (let hop = 0; hop < maxHops; hop++) {
    const next = recommendedReplacement(current, catalog)?.page;
    if (!next || seen.has(modelId(next))) break;
    seen.add(modelId(next));
    chain.push(next);
    if (statusOn(next, today) === "active") break;
    current = next;
  }
  return chain;
}

/**
 * How to name a replacement in prose. Same-provider successors — the vast
 * majority — take the bare model name, because the sentence around them has
 * already said "OpenAI" once and saying it twice reads like a template. A
 * cross-provider successor keeps its brand, where it carries real information.
 */
export function replacementName(from: Model, resolved: ResolvedReplacement): string {
  const sameProvider = resolved.ref.provider === from.provider;
  if (resolved.page) {
    return sameProvider ? resolved.page.name : modelFullLabel(resolved.page);
  }
  return sameProvider
    ? resolved.ref.model
    : `${providerLabel(resolved.ref.provider)} ${resolved.ref.model}`;
}

/**
 * The models that name `model` as a replacement — "what migrated here". This is
 * the inbound half of the internal-link graph and the reason an active model's
 * page is worth reading at all.
 */
export function replacedBy(model: Model, catalog: Model[]): Model[] {
  const id = modelId(model);
  return catalog.filter((other) =>
    other.replacements.some((ref) => `${ref.provider}/${ref.model}` === id),
  );
}
