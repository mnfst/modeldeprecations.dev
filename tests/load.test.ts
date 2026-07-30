import { describe, expect, it } from "vitest";
import { Model } from "../src/schema/model.js";
import { crossCheck } from "../src/data/load.js";
import { model } from "./helpers.js";

function parse(over: Record<string, unknown>) {
  return Model.safeParse({ ...model(), ...over });
}

function errors(result: ReturnType<typeof parse>): string {
  return result.success ? "" : result.error.issues.map((issue) => issue.message).join("; ");
}

describe("Model schema", () => {
  it("accepts a well-formed entry", () => {
    expect(parse({}).success).toBe(true);
  });

  // The one rule the site cannot bend: a date without a citation is a rumour.
  it("rejects a lifecycle date with no source", () => {
    const result = parse({ sources: [] });
    expect(result.success).toBe(false);
    expect(errors(result)).toContain("a lifecycle date needs at least one source");
  });

  it("allows a sourceless entry when it claims no dates", () => {
    const result = parse({
      sources: [],
      deprecated_on: undefined,
      shutdown_on: undefined,
      status: "active",
    });
    expect(result.success).toBe(true);
  });

  it("enforces released_on <= deprecated_on <= shutdown_on", () => {
    expect(errors(parse({ released_on: "2025-01-01", deprecated_on: "2024-06-06" }))).toContain(
      "precedes released_on",
    );
    expect(errors(parse({ deprecated_on: "2025-06-06", shutdown_on: "2024-06-06" }))).toContain(
      "precedes deprecated_on",
    );
  });

  it("refuses a committed and a soft shutdown date on the same entry", () => {
    expect(errors(parse({ earliest_shutdown_on: "2027-01-01" }))).toContain("not both");
  });

  // status is authored but must agree with the dates as of last_verified, so a
  // stale hand-edited status can never contradict the record it sits next to.
  it("rejects a status that contradicts its own dates", () => {
    const result = parse({ status: "active" });
    expect(result.success).toBe(false);
    expect(errors(result)).toContain('status "active" contradicts the dates');
  });

  it("rejects a malformed or impossible date", () => {
    expect(parse({ shutdown_on: "06/06/2025" }).success).toBe(false);
    expect(parse({ shutdown_on: "2025-13-45" }).success).toBe(false);
  });

  it("rejects duplicate aliases and an alias that repeats the canonical id", () => {
    expect(errors(parse({ aliases: ["a", "a"] }))).toContain("aliases must be unique");
    expect(errors(parse({ aliases: ["gpt-4-32k"] }))).toContain("must not repeat in aliases");
  });

  it("allows at most one recommended replacement", () => {
    const two = [
      { provider: "openai", model: "a", recommended: true, external: true },
      { provider: "openai", model: "b", recommended: true, external: true },
    ];
    expect(errors(parse({ replacements: two }))).toContain("at most one replacement");
  });

  it("refuses a model that replaces itself", () => {
    const self = [{ provider: "openai", model: "gpt-4-32k", recommended: true, external: true }];
    expect(errors(parse({ replacements: self }))).toContain("cannot replace itself");
  });

  it("rejects unknown fields rather than silently dropping them", () => {
    expect(parse({ sunset_date: "2025-06-06" }).success).toBe(false);
  });
});

describe("crossCheck", () => {
  const successor = model({
    model: "gpt-4o",
    name: "GPT-4o",
    status: "active",
    deprecated_on: undefined,
    shutdown_on: undefined,
  });

  it("passes when every replacement resolves to a page", () => {
    const source = model({
      replacements: [{ provider: "openai", model: "gpt-4o", recommended: true, external: false }],
    });
    expect(crossCheck([source, successor])).toEqual([]);
  });

  it("flags a replacement with no page and no external marker", () => {
    const source = model({
      replacements: [{ provider: "openai", model: "ghost", recommended: true, external: false }],
    });
    const issues = crossCheck([source]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('replacement "openai/ghost" has no page');
  });

  it("allows an explicitly external replacement", () => {
    const source = model({
      replacements: [
        { provider: "openai", model: "gpt-image-2", recommended: true, external: true },
      ],
    });
    expect(crossCheck([source])).toEqual([]);
  });

  // An alias that is also a real page would make one id resolve two ways.
  it("flags an alias that collides with a canonical id", () => {
    const source = model({ aliases: ["gpt-4o"] });
    const issues = crossCheck([source, successor]);
    expect(issues.some((issue) => issue.message.includes("is also a canonical model id"))).toBe(
      true,
    );
  });

  it("flags the same alias claimed by two models", () => {
    const a = model({ model: "a", aliases: ["shared"] });
    const b = model({ model: "b", aliases: ["shared"] });
    const issues = crossCheck([a, b]);
    expect(issues.some((issue) => issue.message.includes("already claimed by"))).toBe(true);
  });
});
