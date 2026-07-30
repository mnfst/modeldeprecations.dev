// The data guard. A citation site fails in two ways: a URL stops answering, or
// a date stops being true. These are the edits that cause either, expressed as
// a pure diff of two catalogs so the rules need no git to test.

import { describe, expect, it } from "vitest";
import { findRegressions } from "../src/data/regressions.js";
import { model } from "./helpers.js";

const before = [model()];

describe("findRegressions", () => {
  it("passes an unchanged catalog", () => {
    expect(findRegressions(before, [model()])).toEqual([]);
  });

  it("passes a catalog that only adds models", () => {
    const after = [model(), model({ model: "gpt-4o", name: "GPT-4o" })];
    expect(findRegressions(before, after)).toEqual([]);
  });

  // Deleting a page 404s a URL someone has already cited in a README or an
  // answer. Updating its status is always the right move instead.
  it("blocks removing a page", () => {
    const found = findRegressions(before, []);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("page removed");
  });

  it("blocks removing an alias that used to resolve", () => {
    const withAlias = [model({ aliases: ["gpt-4-32k-0613"] })];
    const found = findRegressions(withAlias, [model({ aliases: [] })]);
    expect(found[0]!.message).toContain('alias "gpt-4-32k-0613" removed');
  });

  it("allows adding an alias", () => {
    expect(findRegressions(before, [model({ aliases: ["gpt-4-32k-0314"] })])).toEqual([]);
  });

  it("blocks stripping the sources out from under a date", () => {
    const found = findRegressions(before, [model({ sources: [] })]);
    expect(found[0]!.message).toContain("sources removed while lifecycle dates remain");
  });

  it("allows dropping sources when the dates go with them and the entry is re-verified", () => {
    const undated = model({
      sources: [],
      deprecated_on: undefined,
      shutdown_on: undefined,
      status: "active",
      last_verified: "2026-08-01",
    });
    expect(findRegressions(before, [undated])).toEqual([]);
  });

  it("still blocks clearing dates without re-verifying, even as the sources go too", () => {
    const undated = model({
      sources: [],
      deprecated_on: undefined,
      shutdown_on: undefined,
      status: "active",
    });
    const found = findRegressions(before, [undated]);
    expect(found.map((item) => item.message)).toEqual([
      expect.stringContaining("deprecated_on changed from 2024-06-06 to unset"),
      expect.stringContaining("shutdown_on changed from 2025-06-06 to unset"),
    ]);
  });

  // Silently editing a date is how a wrong answer gets published. Moving
  // last_verified forward is the author asserting they re-checked the source.
  it("blocks a date change that does not move last_verified forward", () => {
    const found = findRegressions(before, [model({ shutdown_on: "2025-07-06" })]);
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("without moving last_verified forward");
  });

  it("allows a date change that comes with a re-verification", () => {
    const reverified = model({ shutdown_on: "2025-07-06", last_verified: "2026-08-01" });
    expect(findRegressions(before, [reverified])).toEqual([]);
  });

  it("catches a date being cleared, not just changed", () => {
    const cleared = model({ deprecated_on: undefined });
    const found = findRegressions(before, [cleared]);
    expect(found[0]!.message).toContain("deprecated_on changed from 2024-06-06 to unset");
  });

  it("reports every distinct regression on one model", () => {
    const damaged = model({ aliases: [], sources: [], shutdown_on: "2030-01-01" });
    const withAlias = [model({ aliases: ["gpt-4-32k-0613"] })];
    const found = findRegressions(withAlias, [damaged]);
    expect(found.length).toBeGreaterThanOrEqual(3);
  });
});
