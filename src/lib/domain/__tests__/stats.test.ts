import { describe, expect, it } from "vitest";
import { addDays, eachDay } from "../dates";
import { buildOccurrences, createIndex, displayStatus } from "../occurrences";
import { goalSummary, habitRowsForWeek, periodStats, weekSummary } from "../stats";
import type { OccurrenceRow, Recurrence, Task } from "../types";
import { habit, now, row, task } from "./helpers";

const DAILY: Recurrence = { type: "daily", interval: 1 };
const MON_FRI: Recurrence = { type: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] };

/** Week of the spec example: Mon 16/11/2026 → Sun 22/11/2026 (already over). */
const WEEK = eachDay("2026-11-16", "2026-11-22");
const TODAY = now("2026-11-24", "12:00");

function marks(t: Task, pattern: string): OccurrenceRow[] {
  // pattern like "✓✓✗✓✓✗✓" (— = not scheduled)
  return [...pattern].flatMap((c, i) => (c === "✓" ? [row(t, WEEK[i]!)] : []));
}

describe("weekly performance (spec example)", () => {
  const cfa = habit("Study CFA", DAILY, "2026-11-01", { weeklyTarget: 7 });
  const english = habit("English", DAILY, "2026-11-01");
  const exercise = habit("Exercise", MON_FRI, "2026-11-01");
  const reading = habit("Reading", DAILY, "2026-11-01");
  const rows = [
    ...marks(cfa, "✓✓✗✓✓✗✓"),
    ...marks(english, "✓✓✓✓✗✓✓"),
    ...marks(exercise, "✓✗✓✗✓——"),
    ...marks(reading, "✓✓✓✓✓✓✓"),
  ];
  const index = createIndex([cfa, english, exercise, reading], rows);

  it("builds the habit table with — for unscheduled days", () => {
    const table = habitRowsForWeek(index, "2026-11-16", TODAY);
    const byTitle = Object.fromEntries(table.map((r) => [r.title, r]));
    expect(`${byTitle["Study CFA"]!.completed}/${byTitle["Study CFA"]!.scheduled}`).toBe("5/7");
    expect(`${byTitle["English"]!.completed}/${byTitle["English"]!.scheduled}`).toBe("6/7");
    expect(`${byTitle["Exercise"]!.completed}/${byTitle["Exercise"]!.scheduled}`).toBe("3/5");
    expect(`${byTitle["Reading"]!.completed}/${byTitle["Reading"]!.scheduled}`).toBe("7/7");
    expect(byTitle["Exercise"]!.cells.map((c) => c.state)).toEqual([
      "completed",
      "overdue",
      "completed",
      "overdue",
      "completed",
      "none",
      "none",
    ]);
  });

  it("computes the summary with the completion-rate formula", () => {
    const s = weekSummary(index, "2026-11-18", TODAY);
    expect(s.state).toBe("past");
    expect(s.stats.scheduled).toBe(26);
    expect(s.stats.completed).toBe(21);
    expect(s.stats.notCompleted).toBe(5);
    expect(s.stats.overdue).toBe(5);
    expect(s.stats.completionRate).toBeCloseTo(21 / 26);
    // Monday (4/4) and Sunday (3/3) are both 100%; Monday has more completions.
    expect(s.bestDay?.date).toBe("2026-11-16");
    expect(s.bestDay?.rate).toBe(1);
  });
});

describe("weekly target attainment (add-on example)", () => {
  it("18 completions of 22 targets = 81.8%, capped per habit", () => {
    const w = "2026-11-16";
    const mk = (title: string, target: number, done: number, extra = 0) => {
      const t = habit(title, DAILY, "2026-11-01", { weeklyTarget: target });
      return { t, rows: WEEK.slice(0, done + extra).map((d) => row(t, d)) };
    };
    const a = mk("Học CFA", 5, 4);
    const b = mk("Học tiếng Anh", 7, 5);
    const c = mk("Tập thể dục", 3, 3);
    const d = mk("Đọc sách", 7, 6);
    const index = createIndex([a.t, b.t, c.t, d.t], [...a.rows, ...b.rows, ...c.rows, ...d.rows]);
    const goal = goalSummary(habitRowsForWeek(index, w, TODAY));
    expect(goal.totalCompletions).toBe(18);
    expect(goal.totalTarget).toBe(22);
    expect(goal.rate).toBeCloseTo(18 / 22);

    // Over-achieving one habit must not hide a shortfall in another.
    const e = mk("Tập thể dục", 3, 3, 2);
    const index2 = createIndex([a.t, b.t, e.t, d.t], [...a.rows, ...b.rows, ...e.rows, ...d.rows]);
    const goal2 = goalSummary(habitRowsForWeek(index2, w, TODAY));
    expect(goal2.totalCompletions).toBe(20);
    expect(goal2.countedCompletions).toBe(18);
    expect(goal2.rate).toBeCloseTo(18 / 22);
  });

  it("caps the target by what was actually scheduled (habit created mid-week)", () => {
    const t = habit("Mới", DAILY, "2026-11-20", { weeklyTarget: 5 });
    const rows = habitRowsForWeek(createIndex([t], [row(t, "2026-11-20")]), "2026-11-16", TODAY);
    expect(rows[0]!.scheduled).toBe(3);
    expect(rows[0]!.target).toBe(3);
  });
});

describe("counting rules", () => {
  it("ticking and unticking repeatedly never double counts", () => {
    const t = task({ title: "Một lần", startDate: "2026-11-24" });
    // The database keeps one row per occurrence; duplicates (e.g. from a bad import) collapse too.
    const r1 = row(t, "2026-11-24", "completed");
    const r2 = { ...row(t, "2026-11-24", "completed"), id: "dup" };
    const index = createIndex([t], [r1, r2]);
    const occs = buildOccurrences(index, "2026-11-24", "2026-11-24");
    expect(occs).toHaveLength(1);
    expect(periodStats(occs, TODAY).completed).toBe(1);
    const unticked = createIndex([t], [{ ...r1, status: "pending", completedAt: null }]);
    expect(periodStats(buildOccurrences(unticked, "2026-11-24", "2026-11-24"), TODAY).completed).toBe(0);
  });

  it("distinguishes completions from completed days", () => {
    const t = habit("Đọc", DAILY, "2026-11-01");
    // Monday's occurrence moved onto Tuesday: two completions on one day.
    const rows = [row(t, "2026-11-16", "completed", { date: "2026-11-17" }), row(t, "2026-11-17")];
    const s = periodStats(buildOccurrences(createIndex([t], rows), "2026-11-16", "2026-11-17"), TODAY);
    expect(s.completed).toBe(2);
    expect(s.completedDays).toBe(1);
  });

  it("separates scheduled, cancelled, skipped and completed", () => {
    const t = habit("Gym", DAILY, "2026-11-16");
    const rows = [row(t, "2026-11-16"), row(t, "2026-11-17", "skipped"), row(t, "2026-11-18", "cancelled")];
    const s = periodStats(buildOccurrences(createIndex([t], rows), "2026-11-16", "2026-11-19"), TODAY);
    expect(s).toMatchObject({ scheduled: 2, completed: 1, skipped: 1, cancelled: 1, overdue: 1 });
    expect(s.completionRate).toBe(0.5);
  });

  it("never marks future work as overdue", () => {
    const t = task({ title: "A", startDate: "2026-11-24", startTime: "08:00", endTime: "10:00" });
    const b = task({ title: "B", startDate: "2026-11-24", startTime: "11:00", endTime: "13:00" });
    const c = task({ title: "C", startDate: "2026-11-25" });
    const d = task({ title: "D", startDate: "2026-11-23" });
    const occs = buildOccurrences(createIndex([t, b, c, d], []), "2026-11-23", "2026-11-25");
    const st = Object.fromEntries(occs.map((o) => [o.title, displayStatus(o, TODAY)]));
    expect(st).toEqual({ A: "overdue", B: "in_progress", C: "upcoming", D: "overdue" });
  });
});

describe("week comparison", () => {
  it("compares the running week with the same days of last week", () => {
    const t = habit("Đọc", DAILY, "2026-11-01");
    const rows = [
      // last week: Mon done, Tue missed, rest done
      row(t, "2026-11-16"),
      row(t, "2026-11-18"),
      row(t, "2026-11-19"),
      row(t, "2026-11-20"),
      row(t, "2026-11-21"),
      row(t, "2026-11-22"),
      // this week: Mon + Tue done
      row(t, "2026-11-23"),
      row(t, "2026-11-24"),
    ];
    const s = weekSummary(createIndex([t], rows), "2026-11-24", TODAY);
    expect(s.state).toBe("current");
    expect(s.comparison?.windowDays).toBe(2);
    expect(s.comparison?.current.completionRate).toBe(1);
    expect(s.comparison?.previous.completionRate).toBe(0.5);
    expect(s.comparison?.rateDelta).toBeCloseTo(0.5);
    expect(s.comparison?.previousFull.completionRate).toBeCloseTo(6 / 7);
    // Full-week rate keeps planned future days in the denominator.
    expect(s.stats.scheduled).toBe(7);
    expect(s.stats.completionRate).toBeCloseTo(2 / 7);
    expect(s.toDate?.completionRate).toBe(1);
  });

  it("handles a week that spans two months and two years", () => {
    const t = habit("Năm mới", DAILY, "2026-12-01");
    const rows = [row(t, "2026-12-31"), row(t, "2027-01-01")];
    const s = weekSummary(createIndex([t], rows), "2027-01-02", now("2027-01-10"));
    expect(s.weekStart).toBe("2026-12-28");
    expect(s.weekEnd).toBe("2027-01-03");
    expect(s.week).toEqual({ year: 2026, week: 53 });
    expect(s.stats).toMatchObject({ scheduled: 7, completed: 2 });
    expect(s.comparison?.previous.scheduled).toBe(7);
    expect(addDays(s.weekEnd, 1)).toBe("2027-01-04");
  });
});
