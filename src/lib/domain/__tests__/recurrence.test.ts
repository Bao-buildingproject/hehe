import { describe, expect, it } from "vitest";
import { expandVersion, maxPerWeek, previewDates, ruleMatches } from "../recurrence";
import { version } from "./helpers";

describe("recurrence rules", () => {
  it("one-time tasks happen only on their date", () => {
    const v = version("t", { startDate: "2026-11-25" });
    expect(expandVersion(v, "2026-11-01", "2026-12-31")).toEqual(["2026-11-25"]);
  });

  it("daily with interval keeps alignment with the anchor", () => {
    const v = version("t", { startDate: "2026-11-23", recurrence: { type: "daily", interval: 3 } });
    expect(expandVersion(v, "2026-11-24", "2026-12-05")).toEqual(["2026-11-26", "2026-11-29", "2026-12-02", "2026-12-05"]);
  });

  it("specific weekdays (Mon, Wed, Fri) work across a month boundary", () => {
    const v = version("t", { startDate: "2026-11-23", recurrence: { type: "weekly", interval: 1, weekdays: [1, 3, 5] } });
    expect(expandVersion(v, "2026-11-28", "2026-12-05")).toEqual(["2026-11-30", "2026-12-02", "2026-12-04"]);
  });

  it("every 2 weeks counts weeks from the anchor week, also across the new year", () => {
    const v = version("t", { startDate: "2026-12-21", recurrence: { type: "weekly", interval: 2, weekdays: [1, 4] } });
    expect(expandVersion(v, "2026-12-21", "2027-01-17")).toEqual(["2026-12-21", "2026-12-24", "2027-01-04", "2027-01-07"]);
  });

  it("never produces dates before the start date (mid-week start)", () => {
    const v = version("t", { startDate: "2026-11-25", recurrence: { type: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] } });
    expect(expandVersion(v, "2026-11-23", "2026-11-29")).toEqual(["2026-11-25", "2026-11-26", "2026-11-27"]);
  });

  it("monthly on day 31 falls back to the last day of shorter months", () => {
    const v = version("t", {
      startDate: "2026-01-31",
      recurrence: { type: "monthly", interval: 1, monthly: { mode: "dayOfMonth", day: 31 } },
    });
    expect(expandVersion(v, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("monthly on the last Friday", () => {
    const v = version("t", {
      startDate: "2026-11-01",
      recurrence: { type: "monthly", interval: 1, monthly: { mode: "nthWeekday", nth: -1, weekday: 5 } },
    });
    expect(expandVersion(v, "2026-11-01", "2027-01-31")).toEqual(["2026-11-27", "2026-12-25", "2027-01-29"]);
  });

  it("monthly every 3 months on the 2nd Monday", () => {
    const v = version("t", {
      startDate: "2026-10-01",
      recurrence: { type: "monthly", interval: 3, monthly: { mode: "nthWeekday", nth: 2, weekday: 1 } },
    });
    expect(expandVersion(v, "2026-10-01", "2027-07-31")).toEqual(["2026-10-12", "2027-01-11", "2027-04-12", "2027-07-12"]);
  });

  it("respects the user's end date and the internal effective window", () => {
    const v = version("t", {
      startDate: "2026-11-01",
      untilDate: "2026-11-10",
      recurrence: { type: "daily", interval: 1 },
      effectiveFrom: "2026-11-05",
    });
    expect(expandVersion(v, "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
  });

  it("handles leap days for daily rules", () => {
    expect(ruleMatches({ type: "daily", interval: 1 }, "2028-02-27", "2028-02-29")).toBe(true);
  });

  it("previews the next occurrences for the form", () => {
    expect(
      previewDates({ recurrence: { type: "weekly", interval: 1, weekdays: [2, 4, 6] }, startDate: "2026-11-24", untilDate: null }, "2026-11-24", 4),
    ).toEqual(["2026-11-24", "2026-11-26", "2026-11-28", "2026-12-01"]);
  });

  it("knows the maximum occurrences per week for target validation", () => {
    expect(maxPerWeek({ type: "daily", interval: 1 })).toBe(7);
    expect(maxPerWeek({ type: "daily", interval: 2 })).toBe(4);
    expect(maxPerWeek({ type: "weekly", interval: 1, weekdays: [1, 3, 5] })).toBe(3);
  });
});
