// modeldeprecations.dev now lives on okapi.bot. Every page of this site has a
// permanent redirect to the okapi.bot page that answers the same question: a
// model's page to the same model on the API serving its maker's models, a
// provider to that API's models, the rest to okapi.bot's hubs. The model
// pages that exist on okapi.bot are read once (generate.ts) into a committed
// map, so the Worker needs no network and the build none either.

export const OKAPI = "https://www.okapi.bot";

/**
 * The okapi.bot APIs serving each provider's own models, in the order to try:
 * a model goes to the first that has a page for it. An API on several hosts is
 * one page there; a second one only keeps what its main host lacks.
 */
export const PROVIDER_APIS: Record<string, string[]> = {
  openai: ["openai"],
  anthropic: ["anthropic"],
  google: ["gemini-api"],
  vertex: ["vertex-ai", "vertex-ai-2"],
  mistral: ["mistral"],
  cohere: ["cohere"],
  xai: ["xai"],
  deepseek: ["deepseek"],
  moonshot: ["moonshot-ai"],
  minimax: ["minimax"],
  alibaba: ["alibaba-model-studio", "alibaba-model-studio-2"],
  bedrock: ["amazon-bedrock"],
  xiaomi: ["xiaomi-mimo"],
  "z-ai": [],
};

/** Provider slugs this site renamed before (cloudflare/_redirects): the old one is the new one. */
export const RENAMED: Record<string, string> = { amazon: "bedrock", qwen: "alibaba", zai: "z-ai" };

/** The site's own pages and files, by path, and where okapi.bot answers them. */
export const STATIC_TARGETS: Record<string, string> = {
  "/": "/models/",
  "/deprecated": "/models/",
  "/retired": "/models/",
  "/active": "/models/",
  "/about": "/models/",
  "/api": "/models/",
  "/calendar": "/breaking-changes/",
  "/changelog": "/breaking-changes/",
  "/changelog.xml": "/breaking-changes/",
  "/calendar.ics": "/breaking-changes/calendar.ics",
  "/llms.txt": "/llms.txt",
  "/llms-full.txt": "/llms.txt",
};

/** okapi.bot's model pages of one API: lower-case model id → its page's path. */
export type ApiModels = Record<string, string>;

/** One model of this site: its provider, its id and the aliases that have pages. */
export interface SiteModel {
  provider: string;
  model: string;
  aliases: string[];
}

const pathOf = (url: string) => url.replace(OKAPI, "");
const mdOf = (page: string) => `${page.replace(/\/$/, "")}.md`;

/**
 * The ids okapi.bot may know a model by: its own, and on Bedrock the invoke id
 * this site leaves out of its URLs (`nova-reel-1-1` → `amazon.nova-reel-v1:1`,
 * `nova-canvas` → `amazon.nova-canvas-v1:0`).
 */
export function okapiIds(provider: string, id: string): string[] {
  if (provider !== "bedrock") return [id];
  const versioned = /^(.*)-(\d+)-(\d+)$/.exec(id);
  return [
    id,
    versioned ? `amazon.${versioned[1]}-v${versioned[2]}:${versioned[3]}` : `amazon.${id}-v1:0`,
  ];
}

/** The okapi.bot page of a model id on one of the provider's APIs; null when none has one. */
export function modelPage(
  provider: string,
  ids: string[],
  okapi: Record<string, ApiModels>,
): string | null {
  for (const api of PROVIDER_APIS[provider] ?? []) {
    for (const id of ids.flatMap((x) => okapiIds(provider, x))) {
      const page = okapi[api]?.[id.toLowerCase()];
      if (page) return pathOf(page);
    }
  }
  return null;
}

/** A provider's models hub on okapi.bot; okapi.bot's models when none serves them. */
export function providerHub(provider: string, okapi: Record<string, ApiModels>): string {
  const api = (PROVIDER_APIS[provider] ?? []).find((a) => okapi[a]);
  return api ? `/models/${api}/` : "/models/";
}

/**
 * Every page path of this site with its target on okapi.bot (paths lower case):
 * a model's page and its Markdown copy, each alias's, each provider's hub. A
 * model okapi.bot has no page of goes to its provider's hub. An alias goes to
 * its own page there, else its model's.
 */
export function buildRedirectMap(
  models: SiteModel[],
  okapi: Record<string, ApiModels>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of models) {
    const hub = providerHub(m.provider, okapi);
    map[`/${m.provider}`] = hub;
    const own = modelPage(m.provider, [m.model], okapi);
    for (const id of [m.model, ...m.aliases]) {
      const page = (id === m.model ? own : (modelPage(m.provider, [id], okapi) ?? own)) ?? hub;
      const key = `/${m.provider}/${id}`.toLowerCase();
      map[key] = page;
      map[`${key}.md`] = page === hub ? hub : mdOf(page);
    }
  }
  return map;
}

/**
 * Whether the Worker serves the path from the static files instead: the JSON
 * API and the badges (READMEs and scripts call them), the images old shares
 * show, and robots.txt and the sitemap, which list the old URLs so search
 * engines find their redirects.
 */
export function servedAsIs(pathname: string): boolean {
  return (
    ["/api/", "/badge/", "/assets/"].some((prefix) => pathname.startsWith(prefix)) ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function safeDecode(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/** A request path, as the map keys it: no trailing slash, no `.html`, lower case, old provider slugs renamed. */
export function normalize(pathname: string): string {
  let p = safeDecode(pathname)
    .toLowerCase()
    .replace(/\.html$/, "");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  const [, first = "", ...rest] = p.split("/");
  const renamed = RENAMED[first];
  return renamed ? `/${[renamed, ...rest].join("/")}` : p || "/";
}

/** Where okapi.bot answers a path of this site: the map's page, the provider's hub, okapi.bot's models. */
export function redirectTarget(pathname: string, map: Record<string, string>): string {
  const p = normalize(pathname);
  const target =
    map[p] ??
    STATIC_TARGETS[p] ??
    (p.startsWith("/shutdowns/") ? "/models/" : undefined) ??
    map[`/${p.split("/")[1] ?? ""}`] ??
    "/models/";
  return `${OKAPI}${target}`;
}
