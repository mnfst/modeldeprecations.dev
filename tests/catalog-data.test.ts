// Tests over the real catalog, not fixtures. The templates elsewhere are
// budget-aware and honest in isolation; only the shipped data has the model
// names, chained replacements and edge dates that break them.

import { describe, expect, it } from "vitest";
import { loadAllModels } from "../src/data/load.js";
import { migrationChain, recommendedReplacement } from "../src/data/replacements.js";
import { buildChangelog } from "../src/data/changelog.js";
import { statusOn, type Model } from "../src/schema/model.js";
import { TODAY } from "./helpers.js";

const { models, issues } = await loadAllModels();

describe("the shipped catalog", () => {
  it("loads with no validation issues", () => {
    expect(issues.map((issue) => `${issue.file}: ${issue.message}`)).toEqual([]);
  });

  it("has enough models to be worth publishing", () => {
    expect(models.length).toBeGreaterThan(100);
  });

  it("covers every provider the site claims to track", () => {
    const providers = new Set(models.map((entry) => entry.provider));
    expect([...providers].sort()).toEqual([
      "amazon",
      "anthropic",
      "cohere",
      "deepseek",
      "google",
      "minimax",
      "mistral",
      "moonshot",
      "openai",
      "qwen",
      "xai",
      "xiaomi",
      "zai",
    ]);
  });

  // The promise on every page is "every date has a source". This is that promise
  // as an assertion.
  it("cites a source for every model that claims a lifecycle date", () => {
    const dated = models.filter(
      (entry) => entry.deprecated_on || entry.shutdown_on || entry.earliest_shutdown_on,
    );
    const uncited = dated.filter((entry) => entry.sources.length === 0);
    expect(uncited.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([]);
    expect(dated.length).toBeGreaterThan(90);
  });

  it("gives every source a URL and an accessed date", () => {
    const bad = models.flatMap((entry) =>
      entry.sources
        .filter(
          (source) =>
            !/^https?:\/\//.test(source.url) || !/^\d{4}-\d{2}-\d{2}$/.test(source.accessed),
        )
        .map(() => `${entry.provider}/${entry.model}`),
    );
    expect(bad).toEqual([]);
  });

  it("keeps every model id unique", () => {
    const ids = models.map((entry) => `${entry.provider}/${entry.model}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A description that repeats is a description that was generated. The site
  // lives on not reading that way.
  it("gives every model a unique, hand-written description", () => {
    const descriptions = models.map((entry) => entry.description.trim());
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    models.forEach((entry, index) => {
      const key = descriptions[index]!;
      const owner = seen.get(key);
      if (owner) duplicates.push(`${entry.provider}/${entry.model} duplicates ${owner}`);
      else seen.set(key, `${entry.provider}/${entry.model}`);
    });
    expect(duplicates).toEqual([]);
  });

  it("writes descriptions that are actually descriptions, not stubs", () => {
    const thin = models.filter((entry) => entry.description.trim().length < 120);
    expect(thin.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([]);
  });

  it("never leaves a deprecated or retired model without a successor", () => {
    const orphans = models
      .filter((entry) => statusOn(entry, TODAY) !== "active")
      .filter((entry) => entry.replacements.length === 0);
    expect(orphans.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([]);
  });

  // A migration path that loops, or that ends on another dead model, is worse
  // than no advice at all.
  it("terminates every migration chain on a model that is still active", () => {
    const dead: string[] = [];
    for (const entry of models) {
      if (statusOn(entry, TODAY) === "active") continue;
      const chain = migrationChain(entry, models, TODAY);
      const last = chain.at(-1);
      const external = recommendedReplacement(entry, models)?.ref.external;
      if (!last && external) continue;
      if (!last || statusOn(last, TODAY) !== "active") {
        dead.push(
          `${entry.provider}/${entry.model} → ${chain.map((m) => m.model).join(" → ") || "(nothing)"}`,
        );
      }
    }
    expect(dead).toEqual([]);
  });

  it("keeps every migration chain short enough to be a chain, not a maze", () => {
    const long = models
      .map((entry) => ({ entry, chain: migrationChain(entry, models, TODAY) }))
      .filter(({ chain }) => chain.length > 4);
    expect(long.map(({ entry }) => `${entry.provider}/${entry.model}`)).toEqual([]);
  });

  it("never lets an alias shadow a canonical id across the whole catalog", () => {
    const ids = new Set(models.map((entry) => `${entry.provider}/${entry.model}`));
    const shadowed = models.flatMap((entry) =>
      entry.aliases
        .filter((alias) => ids.has(`${entry.provider}/${alias}`))
        .map((alias) => `${entry.provider}/${alias}`),
    );
    expect(shadowed).toEqual([]);
  });

  it("dates last_verified no earlier than any date it is supposed to verify", () => {
    const stale = models.filter((entry: Model) => {
      const latest = [entry.deprecated_on, entry.released_on].filter(Boolean).sort().at(-1);
      return latest !== undefined && latest > entry.last_verified;
    });
    expect(stale.map((entry) => `${entry.provider}/${entry.model}`)).toEqual([]);
  });
});

describe("the derived changelog", () => {
  const entries = buildChangelog(models);

  it("produces an entry for every announcement and every shutdown", () => {
    const expected = models.reduce(
      (sum, entry) =>
        sum +
        (entry.deprecated_on ? 1 : 0) +
        (entry.shutdown_on || entry.earliest_shutdown_on ? 1 : 0),
      0,
    );
    expect(entries).toHaveLength(expected);
  });

  it("sorts newest first", () => {
    const dates = entries.map((entry) => entry.date);
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates);
  });

  it("keeps every guid unique so a reader is never notified twice", () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
