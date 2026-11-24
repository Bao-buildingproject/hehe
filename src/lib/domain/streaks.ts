import { type DateStr, type NowContext, addDays, startOfMonth, startOfWeek } from "./dates";
import { type EngineIndex, buildOccurrences, currentVersion, isCounted, taskSpan } from "./occurrences";
import { weeklyTargetFor } from "./stats";
import type { Occurrence, Task } from "./types";

/**
 * Streak rules (they work for habits that are not done every day):
 * - A streak counts consecutive *scheduled* occurrences that were completed.
 *   Days the habit is not scheduled on ("—") are ignored, so a Mon/Wed/Fri
 *   habit done on all three days has a streak of 3 even with rest days between.
 * - Skipped and cancelled occurrences are neutral: they neither break nor extend.
 * - Paused periods generate nothing, so they are neutral too.
 * - Today's unfinished occurrence is neutral until the day ends.
 * - A past scheduled occurrence that was not completed breaks the streak.
 * - The unit is "days" for habits scheduled every day, otherwise "times".
 */
export interface StreakInfo {
  current: number;
  longest: number;
  unit: "day" | "time";
  totalCompletions: number;
  totalCompletedDays: number;
  /** Completed / scheduled from Monday to today (null if nothing scheduled yet). */
  weeklyConsistency: number | null;
  /** Completed / scheduled from the 1st of the month to today. */
  monthlyConsistency: number | null;
  /** Consecutive weeks that met the weekly target (the running week counts once met). */
  goalWeekStreak: number;
  lastCompletedDate: DateStr | null;
}

function consistency(occs: Occurrence[], from: DateStr, today: DateStr): number | null {
  const inWindow = occs.filter((o) => o.date >= from && o.date <= today && isCounted(o));
  if (inWindow.length === 0) return null;
  return inWindow.filter((o) => o.status === "completed").length / inWindow.length;
}

export function isDailyHabit(task: Task, today: DateStr): boolean {
  const r = currentVersion(task, today).recurrence;
  return (
    (r.type === "daily" && r.interval === 1) ||
    (r.type === "weekly" && r.interval === 1 && new Set(r.weekdays).size === 7)
  );
}

export function computeStreak(index: EngineIndex, task: Task, now: NowContext): StreakInfo {
  const today = now.today;
  const span = taskSpan(task);
  const rowDates = index.rowsByDate.filter((r) => r.taskId === task.id).map((r) => r.date);
  let start = span?.start ?? null;
  for (const d of rowDates) if (!start || d < start) start = d;

  const empty: StreakInfo = {
    current: 0,
    longest: 0,
    unit: isDailyHabit(task, today) ? "day" : "time",
    totalCompletions: 0,
    totalCompletedDays: 0,
    weeklyConsistency: null,
    monthlyConsistency: null,
    goalWeekStreak: 0,
    lastCompletedDate: null,
  };
  if (!start || start > today) return empty;

  const occs = buildOccurrences(index, start, today, { taskIds: new Set([task.id]) });

  let run = 0;
  let longest = 0;
  let totalCompletions = 0;
  const completedDays = new Set<DateStr>();
  let lastCompletedDate: DateStr | null = null;
  for (const o of occs) {
    if (!isCounted(o)) continue;
    if (o.status === "completed") {
      run++;
      totalCompletions++;
      completedDays.add(o.date);
      lastCompletedDate = o.date;
      if (run > longest) longest = run;
    } else if (o.date < today) {
      run = 0;
    }
  }

  // Weekly-target streak, walking back one week at a time.
  let goalWeekStreak = 0;
  const thisWeek = startOfWeek(today);
  const firstWeek = startOfWeek(start);
  const byWeek = new Map<DateStr, { scheduled: number; completed: number }>();
  for (const o of occs) {
    if (!isCounted(o)) continue;
    const ws = startOfWeek(o.date);
    const e = byWeek.get(ws) ?? { scheduled: 0, completed: 0 };
    e.scheduled++;
    if (o.status === "completed") e.completed++;
    byWeek.set(ws, e);
  }
  // The running week also needs its future occurrences to know its target.
  if (thisWeek >= firstWeek) {
    const rest = buildOccurrences(index, addDays(today, 1), addDays(thisWeek, 6), { taskIds: new Set([task.id]) });
    const e = byWeek.get(thisWeek) ?? { scheduled: 0, completed: 0 };
    for (const o of rest) {
      if (!isCounted(o)) continue;
      e.scheduled++;
      if (o.status === "completed") e.completed++;
    }
    byWeek.set(thisWeek, e);
  }
  for (let ws = thisWeek; ws >= firstWeek; ws = addDays(ws, -7)) {
    const e = byWeek.get(ws) ?? { scheduled: 0, completed: 0 };
    const { target } = weeklyTargetFor(task, ws, e.scheduled);
    if (target <= 0) continue; // nothing scheduled (paused / not started): neutral
    if (e.completed >= target) goalWeekStreak++;
    else if (ws === thisWeek) continue; // running week not met yet: neutral
    else break;
  }

  return {
    current: run,
    longest,
    unit: empty.unit,
    totalCompletions,
    totalCompletedDays: completedDays.size,
    weeklyConsistency: consistency(occs, thisWeek, today),
    monthlyConsistency: consistency(occs, startOfMonth(today), today),
    goalWeekStreak,
    lastCompletedDate,
  };
}
