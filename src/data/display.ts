import type { Model } from "../schema/model.js";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  xai: "xAI",
  alibaba: "Alibaba",
  cohere: "Cohere",
  minimax: "MiniMax",
  moonshot: "Moonshot AI",
  zai: "Z.ai",
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join(" ");
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? titleCase(provider);
}

/**
 * Provider + model as one phrase, without stuttering when the model name
 * already carries the brand ("Gemini 2.0 Flash" stays "Google Gemini 2.0 Flash",
 * but "OpenAI o1" does not become "OpenAI OpenAI o1").
 */
export function modelFullLabel(model: Pick<Model, "provider" | "name">): string {
  const provider = providerLabel(model.provider);
  const carriesBrand =
    model.name.slice(0, provider.length).toLowerCase() === provider.toLowerCase() &&
    !/[a-z0-9]/i.test(model.name.charAt(provider.length));
  return carriesBrand ? model.name : `${provider} ${model.name}`;
}

/** The hostname of a source URL, for a compact citation line. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
