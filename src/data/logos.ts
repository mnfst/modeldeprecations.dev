import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { CLIENT_DIR } from "./paths.js";

const require = createRequire(import.meta.url);
const LOBE_ICONS_DIR = path.join(
  path.dirname(require.resolve("@lobehub/icons-static-svg/package.json")),
  "icons",
);
const LOCAL_LOGO_DIR = path.join(CLIENT_DIR, "logos");

/** Our provider slugs → lobe-icons filenames, preferring the colour variants. */
const SLUG_TO_LOBE: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google-color",
  meta: "meta",
  mistral: "mistral-color",
  cohere: "cohere-color",
  deepseek: "deepseek-color",
  xai: "xai",
  alibaba: "alibabacloud-color",
  bedrock: "bedrock-color",
  xiaomi: "xiaomimimo",
  minimax: "minimax-color",
  moonshot: "kimi-color",
  "z-ai": "zai",
};

const cache = new Map<string, string | null>();

function readSvg(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

function readLogo(slug: string): string | null {
  if (cache.has(slug)) return cache.get(slug)!;
  const lobeName = SLUG_TO_LOBE[slug];
  const content =
    (lobeName ? readSvg(path.join(LOBE_ICONS_DIR, `${lobeName}.svg`)) : null) ??
    readSvg(path.join(LOCAL_LOGO_DIR, `${slug}.svg`));
  cache.set(slug, content);
  return content;
}

let logoInstanceCounter = 0;

/** Make gradient/filter ids unique per instance so two inline logos can't clash. */
function dedupeIds(svg: string): string {
  const suffix = `_${++logoInstanceCounter}`;
  const ids = new Set<string>();
  svg.replace(/\bid="([^"]+)"/g, (match, id) => {
    ids.add(id);
    return match;
  });
  if (ids.size === 0) return svg;
  let result = svg;
  for (const id of ids) {
    result = result.replaceAll(`id="${id}"`, `id="${id}${suffix}"`);
    result = result.replaceAll(`#${id})`, `#${id}${suffix})`);
    result = result.replaceAll(`"#${id}"`, `"#${id}${suffix}"`);
  }
  return result;
}

export function logoFor(provider: string): string | null {
  const svg = readLogo(provider) ?? readLogo("_default");
  return svg ? dedupeIds(svg) : null;
}
