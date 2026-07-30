// Exposes the catalog to in-browser agents via the WebMCP API
// (window.navigator.modelContext). See https://github.com/webmachinelearning/webmcp.
//
// Standalone by design: it talks to the JSON API and the DOM, so it pulls no
// server-side module (and no zod) into the client bundle.

interface CatalogReplacement {
  provider: string;
  model: string;
  recommended?: boolean;
  note?: string;
}

interface CatalogModel {
  provider: string;
  model: string;
  name: string;
  aliases?: string[];
  status: string;
  computed_status?: string;
  released_on?: string;
  deprecated_on?: string;
  shutdown_on?: string;
  earliest_shutdown_on?: string;
  replacements?: CatalogReplacement[];
  sources?: { url: string; accessed: string }[];
  last_verified: string;
}

interface Catalog {
  count: number;
  asOf?: string;
  models: CatalogModel[];
}

interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  execute: (params: Record<string, unknown>) => Promise<ToolResponse> | ToolResponse;
}

interface ModelContext {
  provideContext?: (context: { tools: ToolDefinition[] }) => void;
}

export function modelId(model: Pick<CatalogModel, "provider" | "model">): string {
  return `${model.provider}/${model.model}`;
}

let catalogPromise: Promise<Catalog> | null = null;

function getCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/v1/models.json")
      .then((res) => {
        if (!res.ok) throw new Error(`catalog fetch failed (${res.status})`);
        return res.json() as Promise<Catalog>;
      })
      .catch((err) => {
        catalogPromise = null;
        throw err;
      });
  }
  return catalogPromise;
}

function ok(payload: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolve a user-supplied id to a catalog entry. Deliberately forgiving: agents
 * pass whatever the developer's code says — a bare id, a `provider/` prefix, a
 * dated snapshot, the wrong case. Any of those should still get an answer.
 */
export function lookupModel(catalog: Catalog, rawId: string): CatalogModel | undefined {
  const wanted = rawId.trim().toLowerCase();
  const bare = wanted.includes("/") ? wanted.slice(wanted.indexOf("/") + 1) : wanted;

  return (
    catalog.models.find((model) => modelId(model).toLowerCase() === wanted) ??
    catalog.models.find((model) => model.model.toLowerCase() === bare) ??
    catalog.models.find((model) =>
      (model.aliases ?? []).some((alias) => alias.toLowerCase() === bare),
    )
  );
}

/**
 * The shape `check_model_deprecation` returns — the direct answer, then the
 * evidence. `origin` is passed in rather than read from `location` so the
 * contract agents depend on stays a pure function and can be unit-tested.
 */
export function deprecationReport(catalog: Catalog, rawId: string, origin = "") {
  const model = lookupModel(catalog, rawId);
  if (!model) {
    return { found: false, query: rawId, error: `No entry for "${rawId}".` };
  }
  const status = model.computed_status ?? model.status;
  const replacement =
    (model.replacements ?? []).find((r) => r.recommended) ?? model.replacements?.[0];
  const queried = rawId.trim().toLowerCase();
  return {
    found: true,
    id: modelId(model),
    name: model.name,
    provider: model.provider,
    // Set when the query was an alias, so an agent can tell the user which id it
    // actually answered about rather than silently substituting one.
    resolvedFrom: queried === modelId(model).toLowerCase() ? undefined : rawId,
    deprecated: status !== "active",
    status,
    released_on: model.released_on,
    deprecated_on: model.deprecated_on,
    shutdown_on: model.shutdown_on,
    earliest_shutdown_on: model.earliest_shutdown_on,
    replacement: replacement ? `${replacement.provider}/${replacement.model}` : undefined,
    migration_note: replacement?.note,
    sources: model.sources ?? [],
    last_verified: model.last_verified,
    page: `${origin}/${modelId(model)}`,
  };
}

/** Reflect an agent's query onto the visible filter so a watching human sees it. */
function reflectInUi(query: string): void {
  const search = document.querySelector<HTMLInputElement>("[data-search]");
  if (!search) return;
  search.value = query;
  search.dispatchEvent(new Event("input", { bubbles: true }));
}

function daysUntil(iso: string, from: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function listShutdowns(catalog: Catalog, withinDays?: number) {
  const asOf = catalog.asOf ?? new Date().toISOString().slice(0, 10);
  const rows = catalog.models
    .map((model) => ({ model, date: model.shutdown_on ?? model.earliest_shutdown_on }))
    .filter((row): row is { model: CatalogModel; date: string } => Boolean(row.date))
    .map((row) => ({ ...row, days: daysUntil(row.date, asOf) }))
    .filter((row) => row.days >= 0 && (withinDays === undefined || row.days <= withinDays))
    .sort((a, b) => a.days - b.days);

  return {
    asOf,
    total: rows.length,
    shutdowns: rows.map((row) => ({
      id: modelId(row.model),
      name: row.model.name,
      shutdown: row.date,
      estimated: !row.model.shutdown_on,
      inDays: row.days,
      replacement: row.model.replacements?.[0]
        ? `${row.model.replacements[0]!.provider}/${row.model.replacements[0]!.model}`
        : undefined,
    })),
  };
}

function usageGuideText(): string {
  const embedded = document.getElementById("how-to-use-md")?.textContent?.trim();
  return embedded && embedded.length > 0
    ? embedded
    : "Usage guide unavailable on this page; fetch /llms-full.txt instead.";
}

function buildTools(): ToolDefinition[] {
  return [
    {
      name: "check_model_deprecation",
      description:
        "Answer whether one model is deprecated. Accepts a bare id (gpt-4-32k), a prefixed id " +
        "(openai/gpt-4-32k) or a dated snapshot alias (gpt-4-32k-0613), case-insensitively. " +
        "Returns status, deprecation and shutdown dates, the recommended replacement, and the " +
        "provider docs the dates come from.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Model id, with or without a provider prefix." },
        },
        required: ["id"],
      },
      execute: async (params) => {
        const id = asString(params.id);
        if (!id) return ok({ error: "Provide an `id`, e.g. gpt-4-32k." });
        reflectInUi(id);
        return ok(deprecationReport(await getCatalog(), id, location.origin));
      },
    },
    {
      name: "list_shutdowns",
      description:
        "List every model with an announced shutdown date still ahead, soonest first. Use " +
        "`within_days` to scope it to an upcoming window.",
      inputSchema: {
        type: "object",
        properties: {
          within_days: { type: "number", description: "Only shutdowns within this many days." },
        },
      },
      execute: async (params) => {
        const within =
          typeof params.within_days === "number" ? Math.max(0, params.within_days) : undefined;
        return ok(listShutdowns(await getCatalog(), within));
      },
    },
    {
      name: "find_replacement",
      description:
        "Follow a deprecated model's replacement chain to a model that is still active today, " +
        "so a migration does not land on another deprecated id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "The deprecated model id." } },
        required: ["id"],
      },
      execute: async (params) => {
        const id = asString(params.id);
        if (!id) return ok({ error: "Provide an `id`." });
        const catalog = await getCatalog();
        const start = lookupModel(catalog, id);
        if (!start) return ok({ found: false, query: id });

        const chain: string[] = [];
        const seen = new Set([modelId(start)]);
        let current = start;
        for (let hop = 0; hop < 6; hop++) {
          const ref =
            (current.replacements ?? []).find((r) => r.recommended) ?? current.replacements?.[0];
          if (!ref) break;
          const nextId = `${ref.provider}/${ref.model}`;
          chain.push(nextId);
          const next = lookupModel(catalog, nextId);
          if (!next || seen.has(modelId(next))) break;
          seen.add(modelId(next));
          if ((next.computed_status ?? next.status) === "active") break;
          current = next;
        }
        return ok({ found: true, from: modelId(start), chain, active: chain.at(-1) });
      },
    },
    {
      name: "get_usage_guide",
      description:
        "Return the modeldeprecations.dev usage guide as Markdown: the API, the badge endpoint, " +
        "the calendar feed, and how the three lifecycle states are defined.",
      inputSchema: { type: "object", properties: {} },
      execute: () => ({ content: [{ type: "text", text: usageGuideText() }] }),
    },
  ];
}

export function setupWebMCP(): void {
  const context = (window.navigator as Navigator & { modelContext?: ModelContext }).modelContext;
  if (!context || typeof context.provideContext !== "function") return;
  try {
    context.provideContext({ tools: buildTools() });
  } catch {
    /* a stricter host may reject the registration; degrade to plain HTML/JSON */
  }
}
