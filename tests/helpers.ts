import type { Model } from "../src/schema/model.js";

/**
 * A minimal valid model. Every test builds from this so a schema change surfaces
 * in one place instead of forty.
 */
export function model(over: Partial<Model> = {}): Model {
  return {
    provider: "openai",
    model: "gpt-4-32k",
    name: "GPT-4 32k",
    aliases: [],
    description:
      "A test model with a description long enough to satisfy the schema's minimum length rule.",
    status: "retired",
    replacements: [],
    sources: [{ url: "https://example.com/deprecations", accessed: "2026-07-30" }],
    last_verified: "2026-07-30",
    deprecated_on: "2024-06-06",
    shutdown_on: "2025-06-06",
    ...over,
  } as Model;
}

export const TODAY = "2026-07-30";
export const SITE = "https://modeldeprecations.dev";
