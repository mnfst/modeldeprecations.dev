// The answer paragraph is the product. These tests pin the contract that makes
// it quotable: it opens with a literal Yes or No, it never claims a date it does
// not have, and it never overstates a soft shutdown as a commitment.

import { describe, expect, it } from "vitest";
import { answerCompact, answerHeadline, answerParagraph } from "../src/data/answer.js";
import { model, TODAY } from "./helpers.js";

const successor = model({
  model: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
  status: "active",
  deprecated_on: undefined,
  shutdown_on: undefined,
});

describe("answerParagraph", () => {
  it("opens with Yes for a retired model and names both dates", () => {
    const answer = answerParagraph(model(), [model()], TODAY);
    expect(answer.startsWith("Yes — ")).toBe(true);
    expect(answer).toContain("is retired");
    expect(answer).toContain("June 6, 2024");
    expect(answer).toContain("June 6, 2025");
  });

  it("opens with No for an active model and dates the claim to last_verified", () => {
    const answer = answerParagraph(successor, [successor], TODAY);
    expect(answer.startsWith("No — ")).toBe(true);
    expect(answer).toContain("not deprecated as of July 30, 2026");
  });

  it("names the recommended replacement", () => {
    const deprecated = model({
      replacements: [
        { provider: "openai", model: "gpt-5.6-sol", recommended: true, external: false },
      ],
    });
    const answer = answerParagraph(deprecated, [deprecated, successor], TODAY);
    expect(answer).toContain("The recommended replacement is GPT-5.6 Sol.");
  });

  it("carries a countdown for a shutdown that is still ahead", () => {
    const soon = model({
      deprecated_on: "2026-05-08",
      shutdown_on: "2026-08-10",
      status: "deprecated",
    });
    expect(answerParagraph(soon, [soon], TODAY)).toContain("(in 11 days)");
  });

  // Saying "shuts down on X" when the provider said "no sooner than X" would be
  // the one kind of error this site cannot afford.
  it("hedges a soft date instead of presenting it as a commitment", () => {
    const soft = model({
      deprecated_on: "2026-01-01",
      shutdown_on: undefined,
      earliest_shutdown_on: "2026-12-01",
      status: "deprecated",
    });
    expect(answerParagraph(soft, [soft], TODAY)).toContain("shuts it down no sooner than");
  });

  it("says plainly when a deprecated model has no published shutdown date", () => {
    const undated = model({
      deprecated_on: "2026-01-01",
      shutdown_on: undefined,
      status: "deprecated",
    });
    const answer = answerParagraph(undated, [undated], TODAY);
    expect(answer).toContain("has not published a shutdown date");
    expect(answer).toContain("still answers requests today");
  });

  // Regression: a retired model with no recoverable date used to fall through to
  // the active branch and claim it was "not deprecated".
  it("does not call a dateless retired model active", () => {
    const dateless = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      status: "retired",
    });
    const answer = answerParagraph(dateless, [dateless], TODAY);
    expect(answer.startsWith("Yes — ")).toBe(true);
    expect(answer).toContain("is retired and no longer served");
    expect(answer).not.toContain("not deprecated");
  });

  it("tells an active model with a scheduled shutdown apart from a deprecated one", () => {
    const scheduled = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      earliest_shutdown_on: "2026-10-16",
      status: "active",
    });
    const answer = answerParagraph(scheduled, [scheduled], TODAY);
    expect(answer.startsWith("No — ")).toBe(true);
    expect(answer).toContain("has not deprecated it");
    expect(answer).toContain("earliest date it could be retired");
  });

  it("does not stutter the provider name", () => {
    for (const subject of [model(), successor]) {
      expect(answerParagraph(subject, [subject], TODAY)).not.toMatch(
        /OpenAI [A-Za-z0-9. -]*OpenAI/,
      );
    }
  });
});

describe("answerCompact", () => {
  it("keeps the verdict when the full paragraph would not fit", () => {
    const compact = answerCompact(model(), [model()], TODAY);
    expect(compact.startsWith("Yes — ")).toBe(true);
    expect(compact.length).toBeLessThan(answerParagraph(model(), [model()], TODAY).length);
  });

  it("keeps the No verdict for an active model", () => {
    expect(answerCompact(successor, [successor], TODAY).startsWith("No — ")).toBe(true);
  });
});

describe("answerHeadline", () => {
  it("states the verdict and the date in one line", () => {
    expect(answerHeadline(model(), TODAY)).toBe("OpenAI GPT-4 32k was retired on June 6, 2025.");
  });

  it("can drop the provider prefix when the caller already supplies context", () => {
    expect(answerHeadline(model(), TODAY, true)).toBe("GPT-4 32k was retired on June 6, 2025.");
  });
});
