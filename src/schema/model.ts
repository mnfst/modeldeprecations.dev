import { z } from "zod";

/**
 * Lifecycle states, using the vocabulary the providers themselves publish.
 *
 * - `active`    — the model still serves requests and has not been deprecated.
 * - `deprecated`— the provider has announced it is going away. It still answers.
 * - `retired`   — API access is gone. Requests fail.
 *
 * The value stored in YAML is validated against the dates as of `last_verified`;
 * the value a page *renders* is recomputed against the build date, so a page
 * flips to "retired" on the day the shutdown lands without anyone editing YAML.
 */
export const Status = z.enum(["active", "deprecated", "retired"]);
export type Status = z.infer<typeof Status>;

const PROVIDER_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const IsoDate = z
  .string()
  .regex(ISO_DATE, "dates must be ISO YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "date must be a real calendar date",
  });

export const Replacement = z
  .object({
    provider: z.string().regex(PROVIDER_SLUG),
    model: z.string().regex(MODEL_ID),
    /** The successor the provider itself names. At most one per model. */
    recommended: z.boolean().default(false),
    /** Migration hint. Call out behavioural or parameter differences here. */
    note: z.string().min(1).max(600).optional(),
    /**
     * Set when the successor has no page on this site (a model outside the
     * tracked providers, or one we have not catalogued yet). The data guard
     * requires every non-external replacement to resolve to a real page.
     */
    external: z.boolean().default(false),
  })
  .strict();
export type Replacement = z.infer<typeof Replacement>;

export const Source = z
  .object({
    url: z.string().url(),
    /** Short human label, e.g. "OpenAI deprecations". Falls back to the host. */
    title: z.string().min(1).max(120).optional(),
    accessed: IsoDate,
  })
  .strict();
export type Source = z.infer<typeof Source>;

export const Model = z
  .object({
    provider: z.string().min(1).regex(PROVIDER_SLUG, "provider must be a kebab-case slug"),
    model: z
      .string()
      .min(1)
      .regex(MODEL_ID, "model must be the provider-native id, without path separators"),
    name: z.string().min(1).max(80),
    /** Dated snapshots and pointers that resolve to this page. */
    aliases: z.array(z.string().regex(MODEL_ID)).default([]),
    description: z.string().min(40).max(900),
    released_on: IsoDate.optional(),
    /** The day the provider announced the deprecation. */
    deprecated_on: IsoDate.optional(),
    /** A committed shutdown date. Use `earliest_shutdown_on` for soft dates. */
    shutdown_on: IsoDate.optional(),
    /**
     * A published *earliest possible* retirement date that is not a commitment —
     * Anthropic's "not sooner than", Google's shutdown column. Rendering these as
     * `shutdown_on` would overstate what the provider actually promised.
     */
    earliest_shutdown_on: IsoDate.optional(),
    status: Status,
    replacements: z.array(Replacement).default([]),
    sources: z.array(Source).default([]),
    last_verified: IsoDate,
  })
  .strict()
  .superRefine((model, ctx) => {
    const issue = (message: string, path: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] });
    };

    if (model.shutdown_on && model.earliest_shutdown_on) {
      issue(
        "set shutdown_on for a committed date or earliest_shutdown_on for a soft one, not both",
        "earliest_shutdown_on",
      );
    }

    const anyDate = model.deprecated_on ?? model.shutdown_on ?? model.earliest_shutdown_on;
    if (anyDate && model.sources.length === 0) {
      issue("a lifecycle date needs at least one source", "sources");
    }

    if (model.released_on) {
      for (const field of ["deprecated_on", "shutdown_on", "earliest_shutdown_on"] as const) {
        const value = model[field];
        if (value && value < model.released_on) {
          issue(`${field} (${value}) precedes released_on (${model.released_on})`, field);
        }
      }
    }
    if (model.deprecated_on && model.shutdown_on && model.shutdown_on < model.deprecated_on) {
      issue(
        `shutdown_on (${model.shutdown_on}) precedes deprecated_on (${model.deprecated_on})`,
        "shutdown_on",
      );
    }

    if (model.aliases.includes(model.model)) {
      issue("the canonical id must not repeat in aliases", "aliases");
    }
    if (new Set(model.aliases).size !== model.aliases.length) {
      issue("aliases must be unique", "aliases");
    }

    const recommended = model.replacements.filter((r) => r.recommended);
    if (recommended.length > 1) {
      issue("at most one replacement can be the recommended successor", "replacements");
    }
    if (model.replacements.some((r) => r.provider === model.provider && r.model === model.model)) {
      issue("a model cannot replace itself", "replacements");
    }

    const derived = statusOn(model as Model, model.last_verified);
    if (derived !== model.status) {
      issue(
        `status "${model.status}" contradicts the dates: as of last_verified (${model.last_verified}) this model is "${derived}"`,
        "status",
      );
    }
  });
export type Model = z.infer<typeof Model>;

export const Catalog = z
  .object({
    $schema: z.string().url().optional(),
    generatedAt: z.string(),
    count: z.number().int().nonnegative(),
    models: z.array(z.unknown()),
  })
  .strict();

/** Canonical id: `provider/model`, the same shape the URL and JSON API use. */
export function modelId(model: Pick<Model, "provider" | "model">): string {
  return `${model.provider}/${model.model}`;
}

/**
 * The model's lifecycle state on a given day.
 *
 * A committed shutdown that has passed means retired, full stop. Otherwise an
 * announced deprecation means deprecated. A soft `earliest_shutdown_on` in the
 * future does *not* make a model deprecated — providers publish those for
 * healthy current models as a routine lifecycle guarantee, and calling those
 * models deprecated would be wrong. Once such a date is in the past, though,
 * the model is gone: that is what the date meant.
 */
export function statusOn(
  model: Pick<Model, "deprecated_on" | "shutdown_on" | "earliest_shutdown_on" | "status">,
  on: string,
): Status {
  if (model.shutdown_on && model.shutdown_on <= on) return "retired";
  if (model.earliest_shutdown_on && model.earliest_shutdown_on <= on) return "retired";
  if (model.deprecated_on && model.deprecated_on <= on) return "deprecated";
  if (model.shutdown_on) return "deprecated";
  if (model.deprecated_on) return "deprecated";
  return model.status === "retired" ? "retired" : model.status;
}

/** The date a page counts down to, whichever kind of shutdown date exists. */
export function shutdownDate(model: Model): string | undefined {
  return model.shutdown_on ?? model.earliest_shutdown_on;
}

/** True when the shutdown date is a provider estimate rather than a commitment. */
export function isSoftShutdown(model: Model): boolean {
  return !model.shutdown_on && Boolean(model.earliest_shutdown_on);
}
