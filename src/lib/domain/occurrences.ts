import { type DateStr, type NowContext, timeToMinutes } from "./dates";
import { expandVersion, isRecurring, versionGenerates, versionWindow } from "./recurrence";
import {
  type DisplayStatus,
  type Occurrence,
  type OccurrenceRow,
  type Task,
  type TaskVersion,
  occurrenceKey,
} from "./types";

export interface EngineIndex {
  tasks: Task[];
  taskById: Map<string, Task>;
  versionById: Map<string, TaskVersion>;
  rowByKey: Map<string, OccurrenceRow>;
  /** Rows sorted by effective date (for range lookups). */
  rowsByDate: OccurrenceRow[];
}

export function createIndex(tasks: Task[], rows: OccurrenceRow[]): EngineIndex {
  const taskById = new Map<string, Task>();
  const versionById = new Map<string, TaskVersion>();
  for (const t of tasks) {
    taskById.set(t.id, t);
    for (const v of t.versions) versionById.set(v.id, v);
  }
  const rowByKey = new Map<string, OccurrenceRow>();
  for (const r of rows) rowByKey.set(occurrenceKey(r.taskId, r.originalDate), r);
  const rowsByDate = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { tasks, taskById, versionById, rowByKey, rowsByDate };
}

function sortedVersions(task: Task): TaskVersion[] {
  return [...task.versions].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  );
}

/** Version whose window contains `date` (ignoring whether the rule fires that day). */
export function versionFor(task: Task, date: DateStr): TaskVersion | null {
  let found: TaskVersion | null = null;
  for (const v of sortedVersions(task)) {
    const from = v.effectiveFrom;
    if (date >= from && (!v.effectiveTo || date <= v.effectiveTo)) found = v;
  }
  return found;
}

/** Version that generates an occurrence on `date`, if any. */
export function generatingVersion(task: Task, date: DateStr): TaskVersion | null {
  for (const v of task.versions) if (versionGenerates(v, date)) return v;
  return null;
}

/**
 * The version that represents the task "now": the one active today, otherwise
 * the most recent one that can still generate something, otherwise the last one.
 */
export function currentVersion(task: Task, today: DateStr): TaskVersion {
  const versions = sortedVersions(task);
  const active = versions.filter((v) => today >= v.effectiveFrom && (!v.effectiveTo || today <= v.effectiveTo));
  if (active.length) return active[active.length - 1]!;
  const nonEmpty = versions.filter((v) => versionWindow(v) !== null);
  const pool = nonEmpty.length ? nonEmpty : versions;
  return pool[pool.length - 1]!;
}

export function taskIsRecurring(task: Task): boolean {
  return task.versions.some((v) => isRecurring(v.recurrence));
}

/** First and last dates the task can generate (end null = open-ended). */
export function taskSpan(task: Task): { start: DateStr; end: DateStr | null } | null {
  let start: DateStr | null = null;
  let end: DateStr | null = null;
  let openEnded = false;
  for (const v of task.versions) {
    const w = versionWindow(v);
    if (!w) continue;
    if (!start || w.start < start) start = w.start;
    if (!w.end) openEnded = true;
    else if (!end || w.end > end) end = w.end;
  }
  if (!start) return null;
  return { start, end: openEnded ? null : end };
}

function resolve(
  task: Task,
  version: TaskVersion,
  originalDate: DateStr,
  row: OccurrenceRow | undefined,
  orphan: boolean,
): Occurrence {
  const o = row?.overrides ?? {};
  const hasTimeOverride = "startTime" in o || "endTime" in o;
  return {
    key: occurrenceKey(task.id, originalDate),
    taskId: task.id,
    versionId: version.id,
    rowId: row?.id ?? null,
    originalDate,
    date: row?.date ?? originalDate,
    title: o.title ?? version.title,
    description: o.description ?? version.description,
    categoryId: version.categoryId,
    priority: o.priority ?? version.priority,
    color: version.color,
    startTime: hasTimeOverride ? (o.startTime ?? null) : version.startTime,
    endTime: hasTimeOverride ? (o.endTime ?? null) : version.endTime,
    recurring: isRecurring(version.recurrence),
    status: row?.status ?? "pending",
    completedAt: row?.completedAt ?? null,
    orphan,
    moved: !!row && row.date !== originalDate,
    overridden: Object.keys(o).length > 0,
    position: task.position,
  };
}

function lowerBound(rows: OccurrenceRow[], date: DateStr): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface BuildOptions {
  taskIds?: ReadonlySet<string>;
}

/**
 * Every occurrence whose effective date falls inside [start, end]:
 * generated occurrences, occurrences moved into the range, and completed
 * history that is no longer part of the schedule. Cancelled occurrences are
 * included (with status "cancelled") so callers can show or hide them.
 */
export function buildOccurrences(
  index: EngineIndex,
  start: DateStr,
  end: DateStr,
  options: BuildOptions = {},
): Occurrence[] {
  const { taskIds } = options;
  const out = new Map<string, Occurrence>();

  for (const task of index.tasks) {
    if (taskIds && !taskIds.has(task.id)) continue;
    for (const v of task.versions) {
      for (const d of expandVersion(v, start, end)) {
        const key = occurrenceKey(task.id, d);
        const row = index.rowByKey.get(key);
        if (row && (row.date < start || row.date > end)) continue; // moved out of range
        out.set(key, resolve(task, v, d, row, false));
      }
    }
  }

  const rows = index.rowsByDate;
  for (let i = lowerBound(rows, start); i < rows.length && rows[i]!.date <= end; i++) {
    const row = rows[i]!;
    if (taskIds && !taskIds.has(row.taskId)) continue;
    const key = occurrenceKey(row.taskId, row.originalDate);
    if (out.has(key)) continue;
    const task = index.taskById.get(row.taskId);
    if (!task) continue;
    const gen = generatingVersion(task, row.originalDate);
    if (gen) {
      out.set(key, resolve(task, gen, row.originalDate, row, false));
    } else if (row.status === "completed") {
      const v =
        versionFor(task, row.originalDate) ??
        (row.versionId ? index.versionById.get(row.versionId) : undefined) ??
        sortedVersions(task).at(-1);
      if (v) out.set(key, resolve(task, v, row.originalDate, row, true));
    }
  }

  return [...out.values()].sort(compareOccurrences);
}

export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.startTime !== b.startTime) {
    if (a.startTime === null) return -1;
    if (b.startTime === null) return 1;
    return a.startTime < b.startTime ? -1 : 1;
  }
  if (a.position !== b.position) return a.position - b.position;
  return a.title.localeCompare(b.title, "vi");
}

export function groupByDate(occurrences: Occurrence[]): Map<DateStr, Occurrence[]> {
  const map = new Map<DateStr, Occurrence[]>();
  for (const o of occurrences) {
    const list = map.get(o.date);
    if (list) list.push(o);
    else map.set(o.date, [o]);
  }
  return map;
}

/** Counted in rates and totals: everything except cancelled and skipped occurrences. */
export function isCounted(o: Pick<Occurrence, "status">): boolean {
  return o.status !== "cancelled" && o.status !== "skipped";
}

/**
 * The deadline has passed without completion: the day is over, or the
 * occurrence has an end time today that is already behind us. Future
 * occurrences are never overdue.
 */
export function isPastDue(o: Pick<Occurrence, "date" | "endTime">, now: NowContext): boolean {
  if (o.date < now.today) return true;
  if (o.date > now.today) return false;
  return o.endTime !== null && now.minutes > timeToMinutes(o.endTime);
}

export function displayStatus(
  o: Pick<Occurrence, "status" | "date" | "startTime" | "endTime">,
  now: NowContext,
): DisplayStatus {
  switch (o.status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      break;
  }
  if (isPastDue(o, now)) return "overdue";
  if (o.status === "in_progress") return "in_progress";
  if (o.date === now.today && o.startTime !== null && now.minutes >= timeToMinutes(o.startTime)) {
    return "in_progress";
  }
  return "upcoming";
}
