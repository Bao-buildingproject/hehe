import {
  type DateStr,
  type NowContext,
  addDays,
  diffDays,
  eachDay,
  endOfMonth,
  endOfWeek,
  isoWeek,
  minDate,
  startOfMonth,
  startOfWeek,
} from "./dates";
import {
  type EngineIndex,
  buildOccurrences,
  displayStatus,
  groupByDate,
  isCounted,
  taskIsRecurring,
  taskSpan,
} from "./occurrences";
import { versionWindow } from "./recurrence";
import type { DisplayStatus, Occurrence, Task } from "./types";

/**
 * Counting rules (shared by every screen):
 * - "Scheduled" = occurrences in the period that are not cancelled or skipped.
 * - "Completed" = scheduled occurrences whose status is completed. An
 *   occurrence is a single row, so ticking and unticking never double counts.
 * - Completion rate = completed / scheduled.
 * - Overdue = not completed and its deadline has passed (never future items).
 */
export interface PeriodStats {
  scheduled: number;
  completed: number;
  notCompleted: number;
  overdue: number;
  inProgress: number;
  upcoming: number;
  skipped: number;
  cancelled: number;
  completionRate: number | null;
  /** Distinct days with at least one completion. */
  completedDays: number;
  /** Distinct days with at least one scheduled occurrence. */
  activeDays: number;
}

export function periodStats(occurrences: Occurrence[], now: NowContext): PeriodStats {
  const s: PeriodStats = {
    scheduled: 0,
    completed: 0,
    notCompleted: 0,
    overdue: 0,
    inProgress: 0,
    upcoming: 0,
    skipped: 0,
    cancelled: 0,
    completionRate: null,
    completedDays: 0,
    activeDays: 0,
  };
  const doneDays = new Set<DateStr>();
  const activeDays = new Set<DateStr>();
  for (const o of occurrences) {
    if (o.status === "cancelled") {
      s.cancelled++;
      continue;
    }
    if (o.status === "skipped") {
      s.skipped++;
      continue;
    }
    s.scheduled++;
    activeDays.add(o.date);
    const st = displayStatus(o, now);
    if (st === "completed") {
      s.completed++;
      doneDays.add(o.date);
    } else if (st === "overdue") s.overdue++;
    else if (st === "in_progress") s.inProgress++;
    else s.upcoming++;
  }
  s.notCompleted = s.scheduled - s.completed;
  s.completionRate = s.scheduled > 0 ? s.completed / s.scheduled : null;
  s.completedDays = doneDays.size;
  s.activeDays = activeDays.size;
  return s;
}

export type PeriodState = "past" | "current" | "future";

export function periodState(start: DateStr, end: DateStr, today: DateStr): PeriodState {
  if (end < today) return "past";
  if (start > today) return "future";
  return "current";
}

export interface DayStat {
  date: DateStr;
  scheduled: number;
  completed: number;
  overdue: number;
  rate: number | null;
  isToday: boolean;
  isFuture: boolean;
}

export function dayStats(occurrences: Occurrence[], start: DateStr, end: DateStr, now: NowContext): DayStat[] {
  const byDate = groupByDate(occurrences);
  return eachDay(start, end).map((date) => {
    const s = periodStats(byDate.get(date) ?? [], now);
    return {
      date,
      scheduled: s.scheduled,
      completed: s.completed,
      overdue: s.overdue,
      rate: s.completionRate,
      isToday: date === now.today,
      isFuture: date > now.today,
    };
  });
}

/** Highest completion rate (ties: more completions, then earlier day). */
export function pickBestDay(days: DayStat[]): DayStat | null {
  let best: DayStat | null = null;
  for (const d of days) {
    if (d.scheduled === 0 || d.rate === null || d.isFuture) continue;
    if (
      !best ||
      d.rate > best.rate! ||
      (d.rate === best.rate && d.completed > best.completed)
    ) {
      best = d;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------

export type HabitCellState = "none" | DisplayStatus;

export interface HabitCell {
  date: DateStr;
  state: HabitCellState;
  occurrences: Occurrence[];
}

export interface HabitWeekRow {
  taskId: string;
  title: string;
  color: string;
  categoryId: string | null;
  paused: boolean;
  cells: HabitCell[];
  scheduled: number;
  completed: number;
  completedDays: number;
  /** Weekly target actually used (capped by what was scheduled this week). */
  target: number;
  /** Target the user configured, if any. */
  configuredTarget: number | null;
  targetMet: boolean;
  progress: number | null;
}

/** Latest version that overlaps the week, used for the week's target. */
function versionForWeek(task: Task, weekStart: DateStr, weekEnd: DateStr) {
  let best = null as Task["versions"][number] | null;
  for (const v of task.versions) {
    const w = versionWindow(v);
    if (!w) continue;
    if (w.start > weekEnd || (w.end && w.end < weekStart)) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom) best = v;
  }
  return best;
}

export function weeklyTargetFor(task: Task, weekStart: DateStr, scheduled: number): {
  target: number;
  configured: number | null;
} {
  const v = versionForWeek(task, weekStart, addDays(weekStart, 6));
  const configured = v?.weeklyTarget ?? null;
  const target = Math.min(configured ?? scheduled, scheduled);
  return { target, configured };
}

function cellState(occs: Occurrence[], now: NowContext): HabitCellState {
  if (occs.length === 0) return "none";
  const counted = occs.filter(isCounted);
  if (counted.length === 0) return occs.some((o) => o.status === "skipped") ? "skipped" : "cancelled";
  const states = counted.map((o) => displayStatus(o, now));
  if (states.every((s) => s === "completed")) return "completed";
  if (states.includes("overdue")) return "overdue";
  if (states.includes("in_progress")) return "in_progress";
  return "upcoming";
}

export function habitRowsForWeek(
  index: EngineIndex,
  weekStart: DateStr,
  now: NowContext,
  occurrencesInWeek?: Occurrence[],
): HabitWeekRow[] {
  const weekEnd = addDays(weekStart, 6);
  const occs = occurrencesInWeek ?? buildOccurrences(index, weekStart, weekEnd);
  const byTask = new Map<string, Occurrence[]>();
  for (const o of occs) {
    const list = byTask.get(o.taskId);
    if (list) list.push(o);
    else byTask.set(o.taskId, [o]);
  }
  const rows: HabitWeekRow[] = [];
  const tasks = [...index.tasks].sort((a, b) => a.position - b.position);
  for (const task of tasks) {
    if (!taskIsRecurring(task)) continue;
    const span = taskSpan(task);
    const own = byTask.get(task.id) ?? [];
    const overlaps = !!span && span.start <= weekEnd && (!span.end || span.end >= weekStart);
    // A paused habit keeps its row (with "—" cells) in the weeks after the pause.
    const pausedInWeek = task.pausedAt !== null && task.pausedAt <= weekEnd && (!span || span.start <= weekEnd);
    if (!overlaps && own.length === 0 && !pausedInWeek) continue;
    const ownByDate = groupByDate(own);
    const cells = eachDay(weekStart, weekEnd).map((date) => {
      const dayOccs = ownByDate.get(date) ?? [];
      return { date, occurrences: dayOccs, state: cellState(dayOccs, now) };
    });
    const counted = own.filter(isCounted);
    const completedOccs = counted.filter((o) => o.status === "completed");
    const scheduled = counted.length;
    const completed = completedOccs.length;
    const { target, configured } = weeklyTargetFor(task, weekStart, scheduled);
    const latest = [...task.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)).at(-1)!;
    rows.push({
      taskId: task.id,
      title: latest.title,
      color: latest.color,
      categoryId: latest.categoryId,
      paused: task.pausedAt !== null,
      cells,
      scheduled,
      completed,
      completedDays: new Set(completedOccs.map((o) => o.date)).size,
      target,
      configuredTarget: configured,
      targetMet: target > 0 && completed >= target,
      progress: target > 0 ? Math.min(1, completed / target) : null,
    });
  }
  return rows;
}

export interface GoalSummary {
  /** All completions of habits this week (not capped). */
  totalCompletions: number;
  /** Completions counted toward targets (each habit capped at its target). */
  countedCompletions: number;
  totalTarget: number;
  /** countedCompletions / totalTarget. */
  rate: number | null;
  habitsWithTarget: number;
  habitsMet: number;
}

export function goalSummary(rows: HabitWeekRow[]): GoalSummary {
  let totalCompletions = 0;
  let countedCompletions = 0;
  let totalTarget = 0;
  let habitsWithTarget = 0;
  let habitsMet = 0;
  for (const r of rows) {
    totalCompletions += r.completed;
    if (r.target <= 0) continue;
    habitsWithTarget++;
    totalTarget += r.target;
    countedCompletions += Math.min(r.completed, r.target);
    if (r.targetMet) habitsMet++;
  }
  return {
    totalCompletions,
    countedCompletions,
    totalTarget,
    rate: totalTarget > 0 ? countedCompletions / totalTarget : null,
    habitsWithTarget,
    habitsMet,
  };
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

export interface WeekComparison {
  /** Window used for both weeks (same weekdays). */
  windowDays: number;
  partial: boolean;
  current: PeriodStats;
  previous: PeriodStats;
  previousFull: PeriodStats;
  /** Difference in completion rate (percentage points as a fraction, e.g. 0.12). */
  rateDelta: number | null;
  completedDelta: number;
}

export interface WeekSummary {
  weekStart: DateStr;
  weekEnd: DateStr;
  week: { year: number; week: number };
  state: PeriodState;
  occurrences: Occurrence[];
  stats: PeriodStats;
  /** Monday → today, for the week in progress. */
  toDate: PeriodStats | null;
  days: DayStat[];
  bestDay: DayStat | null;
  habits: HabitWeekRow[];
  goal: GoalSummary;
  comparison: WeekComparison | null;
}

function statsInWindow(index: EngineIndex, start: DateStr, end: DateStr, now: NowContext): PeriodStats {
  return periodStats(buildOccurrences(index, start, end), now);
}

export function weekSummary(index: EngineIndex, anyDateInWeek: DateStr, now: NowContext): WeekSummary {
  const weekStart = startOfWeek(anyDateInWeek);
  const weekEnd = endOfWeek(anyDateInWeek);
  const occurrences = buildOccurrences(index, weekStart, weekEnd);
  const state = periodState(weekStart, weekEnd, now.today);
  const stats = periodStats(occurrences, now);
  const days = dayStats(occurrences, weekStart, weekEnd, now);
  const toDate =
    state === "current" ? periodStats(occurrences.filter((o) => o.date <= now.today), now) : null;
  const habits = habitRowsForWeek(index, weekStart, now, occurrences);

  let comparison: WeekComparison | null = null;
  if (state !== "future") {
    const windowDays = state === "current" ? diffDays(weekStart, now.today) + 1 : 7;
    const prevStart = addDays(weekStart, -7);
    const current = state === "current" ? toDate! : stats;
    const previous = statsInWindow(index, prevStart, addDays(prevStart, windowDays - 1), now);
    const previousFull = windowDays === 7 ? previous : statsInWindow(index, prevStart, addDays(prevStart, 6), now);
    comparison = {
      windowDays,
      partial: windowDays < 7,
      current,
      previous,
      previousFull,
      rateDelta:
        current.completionRate !== null && previous.completionRate !== null
          ? current.completionRate - previous.completionRate
          : null,
      completedDelta: current.completed - previous.completed,
    };
  }

  return {
    weekStart,
    weekEnd,
    week: isoWeek(weekStart),
    state,
    occurrences,
    stats,
    toDate,
    days,
    bestDay: pickBestDay(days),
    habits,
    goal: goalSummary(habits),
    comparison,
  };
}

export interface TrendPoint {
  weekStart: DateStr;
  week: number;
  scheduled: number;
  completed: number;
  rate: number | null;
  /** True for the week in progress (rate is Monday → today). */
  partial: boolean;
}

/** Completion rate of `count` weeks ending with the week of `lastWeekDate`. */
export function weeklyTrend(index: EngineIndex, lastWeekDate: DateStr, count: number, now: NowContext): TrendPoint[] {
  const last = startOfWeek(lastWeekDate);
  const points: TrendPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ws = addDays(last, -7 * i);
    const we = addDays(ws, 6);
    const state = periodState(ws, we, now.today);
    if (state === "future") {
      points.push({ weekStart: ws, week: isoWeek(ws).week, scheduled: 0, completed: 0, rate: null, partial: false });
      continue;
    }
    const end = state === "current" ? now.today : we;
    const s = statsInWindow(index, ws, end, now);
    points.push({
      weekStart: ws,
      week: isoWeek(ws).week,
      scheduled: s.scheduled,
      completed: s.completed,
      rate: s.completionRate,
      partial: state === "current",
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Months & heatmaps
// ---------------------------------------------------------------------------

export interface HeatCell {
  date: DateStr;
  scheduled: number;
  completed: number;
  /** -1 = nothing scheduled, 0..4 = share of scheduled work completed. */
  level: -1 | 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
  isFuture: boolean;
}

export function heatLevel(scheduled: number, completed: number): HeatCell["level"] {
  if (scheduled === 0) return completed > 0 ? 4 : -1;
  const r = completed / scheduled;
  if (r <= 0) return 0;
  if (r < 0.5) return 1;
  if (r < 0.75) return 2;
  if (r < 1) return 3;
  return 4;
}

export function heatmap(index: EngineIndex, start: DateStr, end: DateStr, now: NowContext, occs?: Occurrence[]): HeatCell[] {
  const days = dayStats(occs ?? buildOccurrences(index, start, end), start, end, now);
  return days.map((d) => ({
    date: d.date,
    scheduled: d.scheduled,
    completed: d.completed,
    level: heatLevel(d.scheduled, d.completed),
    isToday: d.isToday,
    isFuture: d.isFuture,
  }));
}

export interface MonthSummary {
  monthStart: DateStr;
  monthEnd: DateStr;
  state: PeriodState;
  stats: PeriodStats;
  toDate: PeriodStats | null;
  heat: HeatCell[];
}

export function monthSummary(index: EngineIndex, anyDateInMonth: DateStr, now: NowContext): MonthSummary {
  const monthStart = startOfMonth(anyDateInMonth);
  const monthEnd = endOfMonth(anyDateInMonth);
  const occs = buildOccurrences(index, monthStart, monthEnd);
  const state = periodState(monthStart, monthEnd, now.today);
  return {
    monthStart,
    monthEnd,
    state,
    stats: periodStats(occs, now),
    toDate: state === "current" ? periodStats(occs.filter((o) => o.date <= now.today), now) : null,
    heat: heatmap(index, monthStart, monthEnd, now, occs),
  };
}

/** Stats limited to [start, min(end, today)] — used for "to date" consistency. */
export function statsToDate(index: EngineIndex, start: DateStr, end: DateStr, now: NowContext, taskIds?: ReadonlySet<string>) {
  const last = minDate(end, now.today);
  if (last < start) return null;
  return periodStats(buildOccurrences(index, start, last, { taskIds }), now);
}
