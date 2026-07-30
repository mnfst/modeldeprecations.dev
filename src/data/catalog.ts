import { statusOn, type Model, type Status } from "../schema/model.js";
import { lifecycle, urgencyRank, type Lifecycle } from "./status.js";

const SCHEMA_URL = "https://modeldeprecations.dev/api/v1/schema.json";

export interface CatalogEntry extends Model {
  /** Lifecycle recomputed against the build date, not frozen at authoring time. */
  computed_status: Status;
}

export interface CatalogPayload {
  $schema: string;
  generatedAt: string;
  asOf: string;
  count: number;
  models: CatalogEntry[];
}

export function buildCatalog(models: Model[], today: string): CatalogPayload {
  return {
    $schema: SCHEMA_URL,
    generatedAt: new Date().toISOString(),
    asOf: today,
    count: models.length,
    models: models.map((model) => ({ ...model, computed_status: statusOn(model, today) })),
  };
}

export function uniqueProviders(models: Model[]): string[] {
  return [...new Set(models.map((model) => model.provider))].sort((a, b) => a.localeCompare(b));
}

export interface ProviderFacet {
  provider: string;
  count: number;
  deprecated: number;
  retired: number;
  active: number;
}

export function buildProviderFacets(models: Model[], today: string): ProviderFacet[] {
  const facets = new Map<string, ProviderFacet>();
  for (const model of models) {
    const facet = facets.get(model.provider) ?? {
      provider: model.provider,
      count: 0,
      deprecated: 0,
      retired: 0,
      active: 0,
    };
    facet.count += 1;
    facet[statusOn(model, today)] += 1;
    facets.set(model.provider, facet);
  }
  return [...facets.values()].sort(
    (a, b) => b.count - a.count || a.provider.localeCompare(b.provider),
  );
}

export interface Timed {
  model: Model;
  life: Lifecycle;
}

export function withLifecycle(models: Model[], today: string): Timed[] {
  return models.map((model) => ({ model, life: lifecycle(model, today) }));
}

/** Everything still running that has a shutdown date, soonest first. */
export function upcomingShutdowns(models: Model[], today: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.status !== "retired" && entry.life.shutdown)
    .sort(
      (a, b) =>
        urgencyRank(a.life) - urgencyRank(b.life) || a.model.name.localeCompare(b.model.name),
    );
}

/** Everything already gone, most recent first — the archive half of the timeline. */
export function pastShutdowns(models: Model[], today: string): Timed[] {
  return withLifecycle(models, today)
    .filter((entry) => entry.life.status === "retired" && entry.life.shutdown)
    .sort((a, b) => (b.life.shutdown ?? "").localeCompare(a.life.shutdown ?? ""));
}

/** Split a provider's models into the three tables its hub page renders. */
export function providerSections(models: Model[], today: string) {
  const timed = withLifecycle(models, today);
  const byName = (a: Timed, b: Timed): number => a.model.name.localeCompare(b.model.name);
  return {
    shuttingSoon: timed
      .filter((entry) => entry.life.status !== "retired" && entry.life.shutdown)
      .sort((a, b) => urgencyRank(a.life) - urgencyRank(b.life) || byName(a, b)),
    deprecated: timed
      .filter((entry) => entry.life.status === "deprecated" && !entry.life.shutdown)
      .sort(byName),
    retired: timed
      .filter((entry) => entry.life.status === "retired")
      .sort((a, b) => (b.life.shutdown ?? "").localeCompare(a.life.shutdown ?? "") || byName(a, b)),
    active: timed
      .filter((entry) => entry.life.status === "active" && !entry.life.shutdown)
      .sort(byName),
  };
}
