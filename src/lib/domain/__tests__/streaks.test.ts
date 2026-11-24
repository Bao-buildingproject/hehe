import { describe, expect, it } from "vitest";
import { addDays, eachDay } from "../dates";
import { createIndex } from "../occurrences";
import { planPause, planResume } from "../split";
import { computeStreak } from "../streaks";
import type { OccurrenceRow, Task } from "../types";
import { habit, now, row } from "./helpers";

function apply(t: Task, rows: OccurrenceRow[], plan: ReturnType<typeof planPause>, newVersionId = "v-new"): { t: Task; rows: OccurrenceRow[] } {
  let versions = t.versions
    .filter((v) => !plan.versionDeletes.includes(v.id))
    .map((v) => {
      const u = plan.versionUpdates.find((x) => x.id === v.id);
      return u ? { ...v, ...u.patch } : v;
    });
  if (plan.versionCreate) {
    versions = [...versions, { ...plan.versionCreate, id: newVersionId, taskId: t.id, createdAt: "", updatedAt: "" }];
  }
  const nextRows = rows
    .filter((r) => !plan.rowDeletes.includes(r.id))
    .map((r) => {
      const u = plan.rowUpdates.find((x) => x.id === r.id);
      return u ? { ...r, ...u.patch } : r;
    });
  return { t: { ...t, versions, pausedAt: plan.taskPatch ? plan.taskPatch.pausedAt : t.pausedAt }, rows: nextRows };
}

describe("streaks", () => {
  it("English every day for 12 days → current streak 12 days (today still open)", () => {
    const t = habit("Học tiếng Anh", { type: "daily", interval: 1 }, "2026-11-10");
    const rows = eachDay("2026-11-12", "2026-11-23").map((d) => row(t, d));
    const s = computeStreak(createIndex([t], rows), t, now("2026-11-24", "08:00"));
    expect(s.current).toBe(12);
    expect(s.unit).toBe("day");
    expect(s.longest).toBe(12);
    expect(s.totalCompletedDays).toBe(12);
  });

  it("rest days of a Mon/Wed/Fri habit do not break the streak", () => {
    const t = habit("Gym", { type: "weekly", interval: 1, weekdays: [1, 3, 5] }, "2026-11-09");
    const done = ["2026-11-09", "2026-11-11", "2026-11-13", "2026-11-16", "2026-11-18", "2026-11-20"];
    const s = computeStreak(createIndex([t], done.map((d) => row(t, d))), t, now("2026-11-22"));
    expect(s.current).toBe(6);
    expect(s.unit).toBe("time");
  });

  it("a missed scheduled day breaks the streak; skipped days are neutral", () => {
    const t = habit("Đọc", { type: "daily", interval: 1 }, "2026-11-01");
    const rows = [
      row(t, "2026-11-01"),
      row(t, "2026-11-02"),
      // 03 missed
      row(t, "2026-11-04"),
      row(t, "2026-11-05", "skipped"),
      row(t, "2026-11-06"),
      row(t, "2026-11-07"),
    ];
    const s = computeStreak(createIndex([t], rows), t, now("2026-11-08", "09:00"));
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    const later = computeStreak(createIndex([t], rows), t, now("2026-11-09"));
    expect(later.current).toBe(0); // 08 was missed
  });

  it("a paused period is neutral and history survives pause/resume", () => {
    const base = habit("Thiền", { type: "daily", interval: 1 }, "2026-11-01");
    const rows = eachDay("2026-11-01", "2026-11-05").map((d) => row(base, d));
    // Paused on the 6th, resumed on the 10th.
    const paused = apply(base, rows, planPause(base, rows, "2026-11-06", "2026-11-06"));
    expect(paused.t.pausedAt).toBe("2026-11-06");
    const resumed = apply(paused.t, paused.rows, planResume(paused.t, "2026-11-10", "v2"), "v2");
    const more = [...resumed.rows, row(resumed.t, "2026-11-10", "completed", { versionId: "v2" })];
    const s = computeStreak(createIndex([resumed.t], more), resumed.t, now("2026-11-11", "07:00"));
    expect(s.current).toBe(6);
    expect(s.totalCompletions).toBe(6);
    expect(addDays("2026-11-06", 0)).toBe("2026-11-06");
  });

  it("counts consecutive weeks that reached the weekly target", () => {
    const t = habit("CFA", { type: "daily", interval: 1 }, "2026-11-02", { weeklyTarget: 3 });
    const rows = [
      ...["2026-11-02", "2026-11-03", "2026-11-04"],
      ...["2026-11-09", "2026-11-12", "2026-11-14"],
      ...["2026-11-16", "2026-11-17", "2026-11-19", "2026-11-22"],
    ].map((d) => row(t, d));
    // Running week (23/11–29/11) has not reached 3 yet: neutral.
    const s = computeStreak(createIndex([t], rows), t, now("2026-11-24"));
    expect(s.goalWeekStreak).toBe(3);
  });
});
