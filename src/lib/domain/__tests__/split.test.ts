import { describe, expect, it } from "vitest";
import { buildOccurrences, createIndex } from "../occurrences";
import { type ChangePlan, fieldsOf, planFutureChange, planOneTimeEdit } from "../split";
import { periodStats } from "../stats";
import type { OccurrenceRow, Recurrence, Task } from "../types";
import { habit, now, row, task } from "./helpers";

function apply(t: Task, rows: OccurrenceRow[], plan: ChangePlan): { t: Task | null; rows: OccurrenceRow[] } {
  if (plan.deleteTask) return { t: null, rows: [] };
  let versions = t.versions
    .filter((v) => !plan.versionDeletes.includes(v.id))
    .map((v) => {
      const u = plan.versionUpdates.find((x) => x.id === v.id);
      return u ? { ...v, ...u.patch } : v;
    });
  if (plan.versionCreate) versions = [...versions, { ...plan.versionCreate, taskId: t.id, createdAt: "", updatedAt: "" }];
  const nextRows = rows
    .filter((r) => !plan.rowDeletes.includes(r.id))
    .map((r) => {
      const u = plan.rowUpdates.find((x) => x.id === r.id);
      return u ? { ...r, ...u.patch } : r;
    });
  return { t: { ...t, versions }, rows: nextRows };
}

const MWF: Recurrence = { type: "weekly", interval: 1, weekdays: [1, 3, 5] };
const TUE_THU: Recurrence = { type: "weekly", interval: 1, weekdays: [2, 4] };

describe("editing a recurring task from a date onward", () => {
  const gym = habit("Gym", MWF, "2026-11-02", { startTime: "06:00" });
  const rows = ["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-09"].map((d) => row(gym, d));

  it("keeps past occurrences and their completions untouched", () => {
    const plan = planFutureChange(gym, rows, {
      splitDate: "2026-11-11",
      today: "2026-11-11",
      newFields: { ...fieldsOf(gym.versions[0]!), recurrence: TUE_THU, startTime: "20:00", startDate: "2026-11-11" },
      newVersionId: "v-new",
    });
    expect(plan.rowDeletes).toEqual([]);
    const { t, rows: after } = apply(gym, rows, plan);
    const occs = buildOccurrences(createIndex([t!], after), "2026-11-02", "2026-11-20");
    expect(occs.map((o) => `${o.date} ${o.startTime} ${o.status}`)).toEqual([
      "2026-11-02 06:00 completed",
      "2026-11-04 06:00 completed",
      "2026-11-06 06:00 completed",
      "2026-11-09 06:00 completed",
      "2026-11-12 20:00 pending",
      "2026-11-17 20:00 pending",
      "2026-11-19 20:00 pending",
    ]);
  });

  it("keeps completions dated before today even when the new rule no longer includes them", () => {
    // Edit from Monday 09/11 (in the past) — the 09/11 completion is history.
    const plan = planFutureChange(gym, rows, {
      splitDate: "2026-11-09",
      today: "2026-11-11",
      newFields: { ...fieldsOf(gym.versions[0]!), recurrence: TUE_THU, startDate: "2026-11-09" },
      newVersionId: "v-new",
    });
    expect(plan.rowDeletes).toEqual([]);
    const { t, rows: after } = apply(gym, rows, plan);
    const occs = buildOccurrences(createIndex([t!], after), "2026-11-09", "2026-11-11");
    const kept = occs.find((o) => o.date === "2026-11-09")!;
    expect(kept).toMatchObject({ status: "completed", orphan: true });
    expect(periodStats(occs, now("2026-11-11")).completed).toBe(1);
  });

  it("drops future state that the new rule no longer schedules", () => {
    const withFuture = [...rows, row(gym, "2026-11-13", "skipped"), row(gym, "2026-11-16", "completed")];
    const plan = planFutureChange(gym, withFuture, {
      splitDate: "2026-11-11",
      today: "2026-11-11",
      newFields: { ...fieldsOf(gym.versions[0]!), recurrence: TUE_THU, startDate: "2026-11-11" },
      newVersionId: "v-new",
    });
    expect(plan.rowDeletes).toHaveLength(2);
  });

  it("moves state of occurrences that still exist to the new version", () => {
    const withFuture = [...rows, row(gym, "2026-11-13", "skipped")];
    const plan = planFutureChange(gym, withFuture, {
      splitDate: "2026-11-11",
      today: "2026-11-11",
      newFields: { ...fieldsOf(gym.versions[0]!), title: "Gym buổi tối", startTime: "19:00" },
      newVersionId: "v-new",
    });
    expect(plan.rowDeletes).toEqual([]);
    const { t, rows: after } = apply(gym, withFuture, plan);
    const occs = buildOccurrences(createIndex([t!], after), "2026-11-09", "2026-11-13");
    expect(occs.map((o) => `${o.date} ${o.title} ${o.status}`)).toEqual([
      "2026-11-09 Gym completed",
      "2026-11-11 Gym buổi tối pending",
      "2026-11-13 Gym buổi tối skipped",
    ]);
  });

  it("stopping the series from its first date deletes the task; later keeps history", () => {
    const fresh = habit("Mới", MWF, "2026-11-23");
    expect(
      planFutureChange(fresh, [], { splitDate: "2026-11-23", today: "2026-11-23", newFields: null, newVersionId: "" }).deleteTask,
    ).toBe(true);
    const plan = planFutureChange(gym, rows, { splitDate: "2026-11-11", today: "2026-11-11", newFields: null, newVersionId: "" });
    expect(plan.deleteTask).toBe(false);
    const { t, rows: after } = apply(gym, rows, plan);
    const occs = buildOccurrences(createIndex([t!], after), "2026-11-01", "2026-12-31");
    expect(occs).toHaveLength(4);
    expect(occs.every((o) => o.status === "completed")).toBe(true);
  });

  it("works across months and years (rule edited in December, read in January)", () => {
    const t = habit("Đọc sách", { type: "daily", interval: 1 }, "2026-12-01");
    const plan = planFutureChange(t, [row(t, "2026-12-30")], {
      splitDate: "2026-12-31",
      today: "2026-12-31",
      newFields: { ...fieldsOf(t.versions[0]!), recurrence: { type: "weekly", interval: 1, weekdays: [6, 7] }, startDate: "2026-12-31" },
      newVersionId: "v2",
    });
    const { t: t2, rows: r2 } = apply(t, [row(t, "2026-12-30")], plan);
    const occs = buildOccurrences(createIndex([t2!], r2), "2026-12-29", "2027-01-10");
    expect(occs.map((o) => o.date)).toEqual(["2026-12-29", "2026-12-30", "2027-01-02", "2027-01-03", "2027-01-09", "2027-01-10"]);
  });
});

describe("one-time tasks", () => {
  it("moving the date keeps the completion attached to the task", () => {
    const t = task({ title: "Báo cáo", startDate: "2026-11-20" });
    const r = row(t, "2026-11-20");
    const plan = planOneTimeEdit(t, [r], { ...fieldsOf(t.versions[0]!), startDate: "2026-11-21", title: "Báo cáo tài chính" }, "2026-11-24");
    const { t: t2, rows: r2 } = apply(t, [r], plan);
    const occs = buildOccurrences(createIndex([t2!], r2), "2026-11-01", "2026-11-30");
    expect(occs.map((o) => `${o.date} ${o.title} ${o.status}`)).toEqual(["2026-11-21 Báo cáo tài chính completed"]);
  });
});
