// `api_change` on a replacement and `restricted` on a model: the two facts that
// make "swap the id" the wrong advice or "still active" an incomplete answer.
// Both have to survive from the YAML to every surface that serves the entry.

import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/data/catalog.js";
import { modelFaq } from "../src/data/faq.js";
import { buildLlmsFullTxt } from "../src/data/llms.js";
import { modelMarkdown } from "../src/data/markdown.js";
import { buildModelJsonSchema } from "../src/schema/generate.js";
import { Model } from "../src/schema/model.js";
import { renderModelPage } from "../src/build/render-model.js";
import { deprecationReport } from "../src/client/webmcp.js";
import { model, SITE, TODAY } from "./helpers.js";

const API_CHANGE =
  "Realtime API only: open a session on /v1/realtime instead of POST /v1/audio/speech.";
const RESTRICTED = "Only projects that already called it can keep calling it.";

const successor = model({
  model: "gpt-realtime-2.1-mini",
  name: "GPT Realtime 2.1 mini",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
});
const retiring = model({
  model: "tts-1",
  name: "TTS-1",
  replacements: [
    {
      provider: "openai",
      model: "gpt-realtime-2.1-mini",
      recommended: true,
      external: false,
      api_change: API_CHANGE,
    },
  ],
});
const restricted = model({
  model: "gemini-2.5-flash",
  provider: "google",
  name: "Gemini 2.5 Flash",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
  restricted: RESTRICTED,
});
const catalog = [retiring, successor, restricted];

function parse(over: Record<string, unknown>) {
  return Model.safeParse({ ...model(), ...over });
}

function messages(result: ReturnType<typeof parse>): string {
  return result.success ? "" : result.error.issues.map((issue) => issue.message).join("; ");
}

describe("schema", () => {
  const replacement = { provider: "openai", model: "x", recommended: true, external: true };

  it("accepts api_change on a replacement and restricted on a live model", () => {
    expect(parse({ replacements: [{ ...replacement, api_change: API_CHANGE }] }).success).toBe(
      true,
    );
    expect(
      parse({
        status: "active",
        deprecated_on: undefined,
        shutdown_on: undefined,
        restricted: RESTRICTED,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty or overlong api_change", () => {
    expect(parse({ replacements: [{ ...replacement, api_change: "" }] }).success).toBe(false);
    expect(parse({ replacements: [{ ...replacement, api_change: "x".repeat(301) }] }).success).toBe(
      false,
    );
  });

  it("rejects an empty or overlong restriction", () => {
    const live = { status: "active", deprecated_on: undefined, shutdown_on: undefined };
    expect(parse({ ...live, restricted: "" }).success).toBe(false);
    expect(parse({ ...live, restricted: "x".repeat(301) }).success).toBe(false);
  });

  it("refuses a restriction on a retired model or without a source", () => {
    expect(messages(parse({ restricted: RESTRICTED }))).toContain("cannot be restricted");
    const unsourced = parse({
      status: "active",
      deprecated_on: undefined,
      shutdown_on: undefined,
      sources: [],
      restricted: RESTRICTED,
    });
    expect(messages(unsourced)).toContain("a restriction needs at least one source");
  });

  it("publishes both fields in the JSON schema", () => {
    const text = JSON.stringify(buildModelJsonSchema());
    expect(text).toContain('"api_change"');
    expect(text).toContain('"restricted"');
  });
});

describe("served surfaces", () => {
  it("carries both fields in the JSON catalog", () => {
    const payload = buildCatalog(catalog, TODAY);
    const tts = payload.models.find((entry) => entry.model === "tts-1");
    const flash = payload.models.find((entry) => entry.model === "gemini-2.5-flash");
    expect(tts?.replacements[0]?.api_change).toBe(API_CHANGE);
    expect(flash?.restricted).toBe(RESTRICTED);
  });

  it("says the migration is more than the id, in the Markdown and the FAQ", () => {
    expect(modelMarkdown(retiring, catalog, SITE, TODAY)).toContain(
      `  - Not a drop-in: ${API_CHANGE}`,
    );
    const faq = modelFaq(retiring, catalog, TODAY).find((item) =>
      item.question.startsWith("How do I migrate"),
    );
    expect(faq?.answer).toContain("is not enough");
    expect(faq?.answer).not.toContain("Swap the model id");
  });

  it("lists the restriction with the facts", () => {
    expect(modelMarkdown(restricted, catalog, SITE, TODAY)).toContain(
      `| Access | Restricted. ${RESTRICTED} |`,
    );
    expect(buildLlmsFullTxt(SITE, catalog, TODAY)).toContain(`- Access: restricted. ${RESTRICTED}`);
  });

  it("renders both on the model page", async () => {
    expect(await renderModelPage(retiring, catalog, TODAY)).toContain("Not a drop-in:");
    expect(await renderModelPage(restricted, catalog, TODAY)).toContain("Restricted.");
  });

  it("hands both to in-browser agents", () => {
    const report = deprecationReport(buildCatalog(catalog, TODAY), "openai/tts-1") as Record<
      string,
      unknown
    >;
    expect(report.api_change).toBe(API_CHANGE);
    const flash = deprecationReport(
      buildCatalog(catalog, TODAY),
      "google/gemini-2.5-flash",
    ) as Record<string, unknown>;
    expect(flash.restricted).toBe(RESTRICTED);
  });
});
