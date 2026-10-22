import { describe, expect, it } from "vitest";
import committed from "../src/redirects/okapi-map.json";
import {
  buildRedirectMap,
  normalize,
  okapiIds,
  redirectTarget,
  servedAsIs,
} from "../src/redirects/okapi.js";
import worker from "../src/worker/index.js";

const OKAPI = "https://www.okapi.bot";

const okapi = {
  openai: {
    "gpt-4-0613": `${OKAPI}/models/openai/gpt-4-0613/`,
    "gpt-4.1": `${OKAPI}/models/openai/gpt-4.1/`,
  },
  anthropic: { "claude-sonnet-4-5": `${OKAPI}/models/anthropic/claude-sonnet-4-5/` },
  "amazon-bedrock": {
    "amazon.nova-reel-v1:1": `${OKAPI}/models/amazon-bedrock/amazon.nova-reel-v1-1/`,
  },
  minimax: { "minimax-m2.1": `${OKAPI}/models/minimax/minimax-m2.1/` },
};

const map = buildRedirectMap(
  [
    { provider: "openai", model: "gpt-4-0613", aliases: [] },
    { provider: "openai", model: "gpt-5", aliases: [] },
    { provider: "anthropic", model: "claude-sonnet-4-5-20250929", aliases: ["claude-sonnet-4-5"] },
    { provider: "bedrock", model: "nova-reel-1-1", aliases: [] },
    { provider: "minimax", model: "MiniMax-M2.1", aliases: [] },
    { provider: "z-ai", model: "glm-4.5", aliases: [] },
  ],
  okapi,
);

const to = (path: string) => redirectTarget(path, map);

describe("the redirects to okapi.bot", () => {
  it("sends a model to the same model's page on okapi.bot, its Markdown to its Markdown", () => {
    expect(to("/openai/gpt-4-0613")).toBe(`${OKAPI}/models/openai/gpt-4-0613/`);
    expect(to("/openai/gpt-4-0613.md")).toBe(`${OKAPI}/models/openai/gpt-4-0613.md`);
    expect(to("/openai/gpt-4-0613/")).toBe(`${OKAPI}/models/openai/gpt-4-0613/`);
    expect(to("/openai/gpt-4-0613.html")).toBe(`${OKAPI}/models/openai/gpt-4-0613/`);
    expect(to("/minimax/MiniMax-M2.1")).toBe(`${OKAPI}/models/minimax/minimax-m2.1/`);
  });

  it("sends an alias to its own page there, a model okapi.bot lacks to its provider's models", () => {
    expect(to("/anthropic/claude-sonnet-4-5")).toBe(`${OKAPI}/models/anthropic/claude-sonnet-4-5/`);
    expect(to("/anthropic/claude-sonnet-4-5-20250929")).toBe(`${OKAPI}/models/anthropic/`);
    expect(to("/openai/gpt-5")).toBe(`${OKAPI}/models/openai/`);
    expect(to("/openai/gpt-5.md")).toBe(`${OKAPI}/models/openai/`);
    expect(to("/openai/not-a-model")).toBe(`${OKAPI}/models/openai/`);
  });

  it("finds a Bedrock model under its invoke id, and old provider slugs under their new one", () => {
    expect(okapiIds("bedrock", "nova-reel-1-1")).toContain("amazon.nova-reel-v1:1");
    expect(okapiIds("bedrock", "nova-canvas")).toContain("amazon.nova-canvas-v1:0");
    expect(to("/bedrock/nova-reel-1-1")).toBe(
      `${OKAPI}/models/amazon-bedrock/amazon.nova-reel-v1-1/`,
    );
    expect(to("/amazon/nova-reel-1-1")).toBe(
      `${OKAPI}/models/amazon-bedrock/amazon.nova-reel-v1-1/`,
    );
    expect(normalize("/zai/glm-4.5")).toBe("/z-ai/glm-4.5");
  });

  it("sends a provider to its models, a provider okapi.bot does not serve and the rest to its hubs", () => {
    expect(to("/openai")).toBe(`${OKAPI}/models/openai/`);
    expect(to("/z-ai")).toBe(`${OKAPI}/models/`);
    expect(to("/z-ai/glm-4.5")).toBe(`${OKAPI}/models/`);
    expect(to("/")).toBe(`${OKAPI}/models/`);
    expect(to("/deprecated")).toBe(`${OKAPI}/models/`);
    expect(to("/shutdowns/2027")).toBe(`${OKAPI}/models/`);
    expect(to("/calendar")).toBe(`${OKAPI}/breaking-changes/`);
    expect(to("/calendar.ics")).toBe(`${OKAPI}/breaking-changes/calendar.ics`);
    expect(to("/llms-full.txt")).toBe(`${OKAPI}/llms.txt`);
    expect(to("/%E0%A4%A")).toBe(`${OKAPI}/models/`);
  });

  it("keeps the JSON API, the badges, the images, robots.txt and the sitemap", () => {
    for (const p of [
      "/api/v1/models.json",
      "/badge/openai/gpt-4.json",
      "/assets/og.png",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(servedAsIs(p)).toBe(true);
    }
    expect(servedAsIs("/api")).toBe(false);
  });

  it("the committed map lands every page on okapi.bot", () => {
    const targets = Object.values(committed as Record<string, string>);
    expect(targets.length).toBeGreaterThan(400);
    for (const t of targets) expect(t).toMatch(/^\/(models|breaking-changes)\//);
  });
});

describe("the Worker", () => {
  const assets = { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) };

  it("redirects a page for good, without its query, and serves the API from the files", async () => {
    const res = await worker.fetch(new Request("https://modeldeprecations.dev/openai?utm=x"), {
      ASSETS: assets,
    });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${OKAPI}/models/openai/`);
    const api = await worker.fetch(
      new Request("https://www.modeldeprecations.dev/api/v1/models.json"),
      { ASSETS: assets },
    );
    expect(await api.text()).toBe("asset /api/v1/models.json");
  });
});
