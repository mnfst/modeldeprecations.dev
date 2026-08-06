// The countdowns are written into static HTML at build time, so on their own they
// are only correct on the day the build ran. These cover the two halves of the
// fix: the build emitting the date it counted to, and the arithmetic that
// recomputes the phrase from a reader's own clock (src/client/countdown.ts wires
// that to the DOM, which is a three-line loop over what is asserted here).

import { describe, expect, it } from "vitest";
import { countdown } from "../src/build/render.js";
import { daysBetween, localToday, relativeDays } from "../src/data/relative-time.js";
import { lifecycle } from "../src/data/status.js";
import { model } from "./helpers.js";

/** The shutdown that shipped the bug: built on the 3rd, still being read on the 6th. */
const OPUS = model({ deprecated_on: "2025-11-24", shutdown_on: "2026-08-05", status: "active" });
const BUILD_DATE = "2026-08-03";

/** What the client rewrites a rendered countdown to when the reader loads it. */
function asReadOn(target: string, now: Date): string {
  return relativeDays(daysBetween(localToday(now), target));
}

describe("countdown markup", () => {
  it("carries the date it counted to, so a stale page can be corrected", () => {
    expect(countdown(lifecycle(OPUS, BUILD_DATE))).toBe(
      '<time datetime="2026-08-05" data-countdown>in 2 days</time>',
    );
  });

  it("renders nothing for a model with no published shutdown date", () => {
    const bare = model({ shutdown_on: undefined, earliest_shutdown_on: undefined });
    expect(countdown(lifecycle(bare, BUILD_DATE))).toBe("");
  });

  it("counts down to the earliest date when that is all the provider published", () => {
    const soft = model({ shutdown_on: undefined, earliest_shutdown_on: "2026-08-05" });
    expect(countdown(lifecycle(soft, BUILD_DATE))).toContain('datetime="2026-08-05"');
  });
});

describe("re-reading a countdown after the build", () => {
  // The regression itself: a page generated on 2026-08-03 announced "in 2 days"
  // for a model that shut down on the 5th, and went on announcing it.
  it("corrects a countdown that expired after the page was built", () => {
    expect(countdown(lifecycle(OPUS, BUILD_DATE))).toContain(">in 2 days<");
    expect(asReadOn("2026-08-05", new Date(2026, 7, 6, 9, 0))).toBe("1 day ago");
  });

  it("leaves a countdown from a fresh build unchanged", () => {
    expect(asReadOn("2026-08-05", new Date(2026, 7, 3, 9, 0))).toBe("in 2 days");
  });

  it("says 'today' on the shutdown date itself", () => {
    expect(asReadOn("2026-08-05", new Date(2026, 7, 5, 9, 0))).toBe("today");
  });
});

describe("localToday", () => {
  // toISOString() reports the next day for anyone far enough east late in the
  // evening, which is exactly the off-by-one a countdown must not have.
  it("reads the local calendar date, not the UTC one", () => {
    expect(localToday(new Date(2026, 7, 6, 23, 30))).toBe("2026-08-06");
    expect(localToday(new Date(2026, 7, 6, 0, 30))).toBe("2026-08-06");
  });

  it("zero-pads months and days", () => {
    expect(localToday(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
});
