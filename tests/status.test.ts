import { describe, expect, it } from "vitest";
import { isSoftShutdown, shutdownDate, statusOn } from "../src/schema/model.js";
import {
  daysBetween,
  formatDate,
  lifecycle,
  relativeDays,
  statusPill,
} from "../src/data/status.js";
import { model, TODAY } from "./helpers.js";

describe("statusOn", () => {
  it("reports retired once a committed shutdown date has passed", () => {
    expect(statusOn(model({ shutdown_on: "2025-06-06" }), TODAY)).toBe("retired");
  });

  it("reports deprecated while a shutdown date is still ahead", () => {
    const m = model({
      deprecated_on: "2026-04-22",
      shutdown_on: "2026-10-23",
      status: "deprecated",
    });
    expect(statusOn(m, TODAY)).toBe("deprecated");
  });

  it("treats an announced shutdown as a deprecation even with no deprecated_on", () => {
    const m = model({ deprecated_on: undefined, shutdown_on: "2027-01-01", status: "deprecated" });
    expect(statusOn(m, TODAY)).toBe("deprecated");
  });

  // Providers publish an earliest-possible retirement date for models that are
  // current and fully supported. Calling those deprecated would be wrong, and
  // would make the site untrustworthy on exactly the models people check most.
  it("keeps a model active when its only date is a soft, future one", () => {
    const m = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "active",
    });
    expect(statusOn(m, TODAY)).toBe("active");
  });

  it("reports retired once even a soft date has passed", () => {
    const m = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      earliest_shutdown_on: "2026-06-01",
      status: "retired",
    });
    expect(statusOn(m, TODAY)).toBe("retired");
  });

  it("honours an authored status when no dates are known at all", () => {
    const bare = { status: "deprecated" as const };
    expect(statusOn(bare, TODAY)).toBe("deprecated");
    expect(statusOn({ status: "active" as const }, TODAY)).toBe("active");
  });

  // The whole point of recomputing status at build time: a page flips itself.
  it("flips a deprecated model to retired as the build date crosses the shutdown", () => {
    const m = model({
      deprecated_on: "2026-04-22",
      shutdown_on: "2026-10-23",
      status: "deprecated",
    });
    expect(statusOn(m, "2026-10-22")).toBe("deprecated");
    expect(statusOn(m, "2026-10-23")).toBe("retired");
  });
});

describe("shutdownDate and isSoftShutdown", () => {
  it("prefers a committed date and marks it firm", () => {
    const m = model({ shutdown_on: "2026-10-23" });
    expect(shutdownDate(m)).toBe("2026-10-23");
    expect(isSoftShutdown(m)).toBe(false);
  });

  it("falls back to the earliest date and marks it soft", () => {
    const m = model({
      shutdown_on: undefined,
      earliest_shutdown_on: "2027-05-28",
      status: "active",
    });
    expect(shutdownDate(m)).toBe("2027-05-28");
    expect(isSoftShutdown(m)).toBe(true);
  });
});

describe("date helpers", () => {
  it("formats ISO dates the way the pages read them", () => {
    expect(formatDate("2025-06-06")).toBe("June 6, 2025");
    expect(formatDate("2026-12-11")).toBe("December 11, 2026");
    expect(formatDate(undefined)).toBe("");
  });

  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-07-30", "2026-08-10")).toBe(11);
    expect(daysBetween("2026-07-30", "2026-07-30")).toBe(0);
    expect(daysBetween("2026-07-30", "2026-07-23")).toBe(-7);
  });

  // Countdowns straddle a DST change in most timezones; the arithmetic is UTC so
  // "in 11 days" cannot silently become "in 10 days" depending on where a build runs.
  it("is not thrown off by daylight-saving transitions", () => {
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-10-01", "2026-11-01")).toBe(31);
  });

  it("phrases relative days for both past and future", () => {
    expect(relativeDays(11)).toBe("in 11 days");
    expect(relativeDays(1)).toBe("in 1 day");
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(-1)).toBe("1 day ago");
    expect(relativeDays(-419)).toBe("419 days ago");
  });
});

describe("lifecycle", () => {
  it("marks an active model with a published date as scheduled, not deprecated", () => {
    const m = model({
      deprecated_on: undefined,
      shutdown_on: undefined,
      earliest_shutdown_on: "2026-10-16",
      status: "active",
    });
    const life = lifecycle(m, TODAY);
    expect(life.status).toBe("active");
    expect(life.scheduled).toBe(true);
    expect(statusPill(life)).toBe("Shutdown scheduled");
  });

  it("flags a deprecated model with no date so the page can say so honestly", () => {
    const m = model({ deprecated_on: "2026-01-01", shutdown_on: undefined, status: "deprecated" });
    const life = lifecycle(m, TODAY);
    expect(life.dateUnconfirmed).toBe(true);
    expect(life.daysToShutdown).toBeUndefined();
    expect(statusPill(life)).toBe("Deprecated");
  });
});
