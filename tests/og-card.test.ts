// Social cards are the one surface that gets read without the page around it —
// pasted into Slack, rendered in a timeline. A card that contradicts itself is
// worse than no card, because the pill and the text are read together.

import { describe, expect, it } from "vitest";
import {
  apiCard,
  calendarCard,
  changelogCard,
  homeCard,
  modelCard,
  providerCard,
} from "../src/build/og.js";
import { renderOgCard, STATUS_COLORS } from "../src/build/og-card.js";
import path from "node:path";
import { loadAllModels } from "../src/data/load.js";
import { CLIENT_DIR } from "../src/data/paths.js";
import { fontCodePoints, unrenderable } from "./font-coverage.js";
import { statusOn } from "../src/schema/model.js";
import { model, TODAY } from "./helpers.js";

const { models } = await loadAllModels();

describe("modelCard", () => {
  it("states the shutdown date for a retired model", () => {
    const card = modelCard(model(), models, TODAY);
    expect(card.status).toBe("Retired");
    expect(card.subline).toBe("Shut down June 6, 2025");
  });

  // Regression: branching on the date before the status let a retired model with
  // no recoverable shutdown day fall through to the active wording, putting
  // "Not deprecated" beside a red RETIRED pill.
  it("does not claim a dateless retired model is active", () => {
    const dateless = model({ deprecated_on: undefined, shutdown_on: undefined, status: "retired" });
    const card = modelCard(dateless, [dateless], TODAY);
    expect(card.status).toBe("Retired");
    expect(card.subline).toBe("Retired · shutdown date not published");
    expect(card.subline).not.toContain("Not deprecated");
  });

  it("counts down a deprecated model with a firm date", () => {
    const soon = model({
      deprecated_on: "2026-05-08",
      shutdown_on: "2026-08-10",
      status: "deprecated",
    });
    expect(modelCard(soon, [soon], TODAY).subline).toBe("Shuts down August 10, 2026 · in 11 days");
  });

  it("hedges a soft date whether the model is active or deprecated", () => {
    const active = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "active",
    });
    expect(modelCard(active, [active], TODAY).subline).toContain("Shutdown no sooner than");

    const deprecated = model({
      deprecated_on: "2026-01-01",
      shutdown_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "deprecated",
    });
    expect(modelCard(deprecated, [deprecated], TODAY).subline).toContain("Shutdown no sooner than");
  });

  it("says plainly when an active model has no dates at all", () => {
    const active = model({ deprecated_on: undefined, shutdown_on: undefined, status: "active" });
    expect(modelCard(active, [active], TODAY).subline).toBe(
      "Not deprecated · verified July 30, 2026",
    );
  });
});

describe("every card in the real catalog", () => {
  it("never contradicts its own status pill", () => {
    const contradictions = models
      .map((entry) => ({ entry, card: modelCard(entry, models, TODAY) }))
      .filter(({ entry, card }) => {
        const status = statusOn(entry, TODAY);
        const sub = card.subline ?? "";
        if (status !== "active" && /Not deprecated/.test(sub)) return true;
        if (status === "active" && /^Shut down /.test(sub)) return true;
        if (status === "retired" && /Shuts down/.test(sub)) return true;
        return false;
      })
      .map(
        ({ entry, card }) => `${entry.provider}/${entry.model}: ${card.status} / ${card.subline}`,
      );
    expect(contradictions).toEqual([]);
  });

  it("gives every card a headline, a status and a subline", () => {
    const incomplete = models
      .map((entry) => ({ entry, card: modelCard(entry, models, TODAY) }))
      .filter(({ card }) => !card.headline || !card.status || !card.subline)
      .map(({ entry }) => `${entry.provider}/${entry.model}`);
    expect(incomplete).toEqual([]);
  });

  it("renders valid, escaped SVG for every model", () => {
    for (const entry of models) {
      const svg = renderOgCard(modelCard(entry, models, TODAY));
      expect(svg.startsWith("<svg xmlns=")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      // An unescaped & or < would make the document unparseable to the rasterizer.
      expect(svg.replace(/&(amp|lt|gt|quot);/g, "")).not.toMatch(/&(?![a-z]+;)/);
    }
  });

  it("colours the top rule by lifecycle state", () => {
    const retired = renderOgCard(modelCard(model(), models, TODAY));
    expect(retired).toContain(STATUS_COLORS.retired);
  });
});

describe("aggregate cards", () => {
  it("builds home, provider, calendar, changelog and api cards", () => {
    expect(homeCard(models, TODAY).headline).toContain("shut down");
    expect(
      providerCard(
        "openai",
        models.filter((m) => m.provider === "openai"),
        TODAY,
      ).subline,
    ).toMatch(/\d+ deprecated · \d+ retired · \d+ active/);
    expect(calendarCard(models, TODAY).headline).toBe("AI model shutdown calendar");
    expect(changelogCard(217).subline).toContain("217");
    expect(apiCard(models.length).subline).toContain(String(models.length));
  });
});

// Cards are rasterized with `loadSystemFonts: false`, so resvg has no fallback:
// any character outside the vendored Outfit subset is drawn as a tofu box on the
// shared image. This caught a "→" in the successor chip that shipped on every
// card with a replacement.
describe("card text stays inside the vendored font", () => {
  const points = fontCodePoints(path.join(CLIENT_DIR, "fonts", "outfit-700.ttf"));

  function textOf(card: {
    eyebrow?: string;
    headline: string;
    subline?: string;
    status?: string;
    chips?: string[];
  }) {
    return [
      card.eyebrow,
      card.headline,
      card.subline,
      card.status?.toUpperCase(),
      ...(card.chips ?? []),
    ]
      .filter(Boolean)
      .join(" ");
  }

  it("reads a real cmap", () => {
    expect(points.size).toBeGreaterThan(100);
    expect(points.has("A".codePointAt(0)!)).toBe(true);
    expect(points.has(0x2192)).toBe(false); // the arrow that caused this test
  });

  it("draws every model card with glyphs the font actually has", () => {
    const broken = models
      .map((entry) => ({
        entry,
        missing: unrenderable(textOf(modelCard(entry, models, TODAY)), points),
      }))
      .filter(({ missing }) => missing.length > 0)
      .map(
        ({ entry, missing }) =>
          `${entry.provider}/${entry.model}: ${[...new Set(missing)].join("")}`,
      );
    expect(broken).toEqual([]);
  });

  it("draws every aggregate card with glyphs the font actually has", () => {
    const cards = [
      homeCard(models, TODAY),
      calendarCard(models, TODAY),
      changelogCard(217),
      apiCard(models.length),
      ...[
        "openai",
        "anthropic",
        "google",
        "deepseek",
        "mistral",
        "xai",
        "cohere",
        "moonshot",
        "minimax",
        "z-ai",
        "alibaba",
        "bedrock",
        "xiaomi",
      ].map((p) =>
        providerCard(
          p,
          models.filter((m) => m.provider === p),
          TODAY,
        ),
      ),
    ];
    const broken = cards
      .map((card) => unrenderable(textOf(card), points))
      .filter((missing) => missing.length > 0);
    expect(broken).toEqual([]);
  });
});
