import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  isValidDateStr,
  isoWeek,
  monthGrid,
  nowContext,
  startOfWeek,
  weekdayOf,
  zonedDateTimeToInstant,
} from "../dates";

describe("dates", () => {
  it("validates calendar dates including leap years", () => {
    expect(isValidDateStr("2028-02-29")).toBe(true);
    expect(isValidDateStr("2026-02-29")).toBe(false);
    expect(isValidDateStr("2026-13-01")).toBe(false);
    expect(isValidDateStr("2026-1-01")).toBe(false);
  });

  it("computes ISO weekdays (Monday = 1, Sunday = 7)", () => {
    expect(weekdayOf("2026-11-23")).toBe(1);
    expect(weekdayOf("2026-11-29")).toBe(7);
    expect(weekdayOf("1969-12-31")).toBe(3);
  });

  it("starts weeks on Monday across month and year boundaries", () => {
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
    expect(startOfWeek("2026-12-01")).toBe("2026-11-30");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-28", 6)).toBe("2027-01-03");
  });

  it("does day arithmetic without DST or timezone drift", () => {
    expect(diffDays("2026-03-01", "2026-03-31")).toBe(30);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("clamps month arithmetic to the last day of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("numbers ISO weeks correctly at year boundaries", () => {
    expect(isoWeek("2026-11-23")).toEqual({ year: 2026, week: 48 });
    expect(isoWeek("2026-12-31")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });

  it("builds a Monday-first six-week month grid", () => {
    const grid = monthGrid("2026-11-15");
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-10-26");
    expect(weekdayOf(grid[0]!)).toBe(1);
  });

  it("derives 'today' in Asia/Ho_Chi_Minh, not in the machine timezone", () => {
    // 2026-11-23 18:30 UTC is already 2026-11-24 01:30 in Vietnam.
    const ctx = nowContext("Asia/Ho_Chi_Minh", new Date("2026-11-23T18:30:00Z"));
    expect(ctx).toEqual({ today: "2026-11-24", minutes: 90 });
  });

  it("converts wall-clock time in a timezone to an instant", () => {
    expect(zonedDateTimeToInstant("2026-11-24", "19:00", "Asia/Ho_Chi_Minh").toISOString()).toBe(
      "2026-11-24T12:00:00.000Z",
    );
    // New York switches to DST on 2026-03-08.
    expect(zonedDateTimeToInstant("2026-03-09", "09:00", "America/New_York").toISOString()).toBe(
      "2026-03-09T13:00:00.000Z",
    );
  });
});
