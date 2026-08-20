import { describe, expect, it } from "vitest";
import { planIssueActions, type ExistingIssue } from "../src/sources/issues.js";
import type { SourceReport } from "../src/sources/report.js";

function report(status: "error" | "unchanged" = "error"): SourceReport {
  const base = {
    provider: "openai",
    slug: "deprecations",
    url: "https://example.com/deprecations.md",
    attempts: 3,
  };
  return {
    version: 1,
    started_at: "2026-08-20T04:00:00.000Z",
    results: [
      status === "error"
        ? { ...base, status, error_code: "http_status", error_message: "source returned HTTP 500" }
        : {
            ...base,
            status,
            before_bytes: 10,
            after_bytes: 10,
            before_sha256: "a".repeat(64),
            after_sha256: "a".repeat(64),
          },
    ],
  };
}

const marker = "<!-- source-fetch:openai/deprecations -->";

function issue(state: "open" | "closed"): ExistingIssue {
  return { number: 42, state, body: marker };
}

describe("planIssueActions", () => {
  it("opens one issue for a new failure", () => {
    expect(planIssueActions(report(), [])).toEqual([
      expect.objectContaining({
        type: "create",
        title: "Source fetch failing: openai/deprecations",
      }),
    ]);
  });

  it("quietly updates a repeated open failure", () => {
    expect(planIssueActions(report(), [issue("open")])).toEqual([
      expect.objectContaining({ type: "update", number: 42 }),
    ]);
  });

  it("reopens and comments when a failure recurs", () => {
    expect(planIssueActions(report(), [issue("closed")])).toEqual([
      expect.objectContaining({ type: "update", state: "open" }),
      expect.objectContaining({ type: "comment", body: "Failure recurred on 2026-08-20 UTC." }),
    ]);
  });

  it("comments and closes after recovery", () => {
    expect(planIssueActions(report("unchanged"), [issue("open")])).toEqual([
      expect.objectContaining({ type: "comment", body: "Source recovered on 2026-08-20 UTC." }),
      expect.objectContaining({ type: "update", state: "closed" }),
    ]);
  });
});
