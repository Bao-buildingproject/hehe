import { describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from "../../settings";
import { createIndex } from "../occurrences";
import { dueReminders } from "../reminders";
import { habit, now, row, task } from "./helpers";

const prefs = (patch: Partial<NotificationPrefs> = {}): NotificationPrefs => ({ ...DEFAULT_NOTIFICATION_PREFS, ...patch });

describe("reminders", () => {
  it("reminds N minutes before the start time, once per window", () => {
    const t = task({ title: "Học CFA", startDate: "2026-11-24", startTime: "19:00", endTime: "21:00" });
    const index = createIndex([t], []);
    expect(dueReminders(index, prefs(), now("2026-11-24", "18:44"), 10)).toHaveLength(0);
    const due = dueReminders(index, prefs(), now("2026-11-24", "18:46"), 10);
    expect(due.map((r) => r.kind)).toEqual(["beforeStart"]);
    expect(due[0]!.title).toContain("Học CFA");
    // Completed tasks are not reminded.
    const done = createIndex([t], [row(t, "2026-11-24")]);
    expect(dueReminders(done, prefs(), now("2026-11-24", "18:46"), 10)).toHaveLength(0);
  });

  it("handles a start time just after midnight (reminder the evening before)", () => {
    const t = task({ title: "Chuyến bay", startDate: "2026-11-25", startTime: "00:05" });
    const due = dueReminders(createIndex([t], []), prefs(), now("2026-11-24", "23:52"), 10);
    expect(due.map((r) => r.title)).toEqual(["Sắp đến giờ: Chuyến bay"]);
  });

  it("lists unfinished work at the chosen time and skips when everything is done", () => {
    const a = habit("Đọc sách", { type: "daily", interval: 1 }, "2026-11-01");
    const b = task({ title: "Báo cáo", startDate: "2026-11-24" });
    const p = prefs({ unfinished: { enabled: true, time: "20:00" } });
    const due = dueReminders(createIndex([a, b], []), p, now("2026-11-24", "20:03"), 10);
    expect(due.find((r) => r.kind === "unfinished")?.title).toBe("Còn 2 việc chưa hoàn thành hôm nay");
    const allDone = createIndex([a, b], [row(a, "2026-11-24"), row(b, "2026-11-24")]);
    expect(dueReminders(allDone, p, now("2026-11-24", "20:03"), 10).filter((r) => r.kind === "unfinished")).toHaveLength(0);
  });

  it("sends the weekly summary only on Sunday evening", () => {
    const a = habit("Đọc sách", { type: "daily", interval: 1 }, "2026-11-01");
    const index = createIndex([a], [row(a, "2026-11-23"), row(a, "2026-11-24")]);
    const p = prefs({ weeklySummary: { enabled: true, time: "20:00" } });
    expect(dueReminders(index, p, now("2026-11-28", "20:01"), 10).some((r) => r.kind === "weeklySummary")).toBe(false);
    const sunday = dueReminders(index, p, now("2026-11-29", "20:01"), 10).find((r) => r.kind === "weeklySummary");
    expect(sunday?.body).toContain("2/7");
    expect(sunday?.key).toBe("weekly:2026-11-23");
  });

  it("respects the on/off switches", () => {
    const t = task({ title: "Họp", startDate: "2026-11-24", startTime: "09:00" });
    const off = prefs({ beforeStart: { enabled: false, minutes: 15 } });
    expect(dueReminders(createIndex([t], []), off, now("2026-11-24", "08:50"), 10)).toHaveLength(0);
  });
});
