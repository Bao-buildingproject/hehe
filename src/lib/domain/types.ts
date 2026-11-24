import type { DateStr, TimeStr, Weekday } from "./dates";

export type Priority = "low" | "medium" | "high";

export type MonthlyRule =
  | { mode: "dayOfMonth"; day: number }
  | { mode: "nthWeekday"; nth: 1 | 2 | 3 | 4 | -1; weekday: Weekday };

/**
 * How a task repeats. The rule is anchored on the version's `startDate`:
 * intervals ("every 2 weeks") and monthly rules count from that date.
 */
export type Recurrence =
  | { type: "none" }
  | { type: "daily"; interval: number }
  | { type: "weekly"; interval: number; weekdays: Weekday[] }
  | { type: "monthly"; interval: number; monthly: MonthlyRule };

/**
 * Stored status of one occurrence.
 * - pending: scheduled, not done yet (shown as upcoming or overdue)
 * - in_progress: the user marked it as being worked on
 * - completed: done (counted once, however many times it was toggled)
 * - skipped: deliberately skipped; not counted as missed and not counted in rates
 * - cancelled: this occurrence was removed from the plan
 */
export type OccurrenceStatus = "pending" | "in_progress" | "completed" | "skipped" | "cancelled";

/** Colour-coded state shown in the UI. */
export type DisplayStatus = "completed" | "in_progress" | "overdue" | "upcoming" | "skipped" | "cancelled";

/** User-editable fields of a task (one "version" of its settings). */
export interface TaskFields {
  title: string;
  description: string;
  categoryId: string | null;
  priority: Priority;
  color: string;
  startTime: TimeStr | null;
  endTime: TimeStr | null;
  recurrence: Recurrence;
  /** First possible occurrence and recurrence anchor ("Ngày thực hiện / bắt đầu"). */
  startDate: DateStr;
  /** Last possible occurrence chosen by the user ("Ngày kết thúc"), or null. */
  untilDate: DateStr | null;
  /** Target completions per Monday–Sunday week (recurring tasks only). */
  weeklyTarget: number | null;
}

/**
 * A task keeps a list of versions. Editing "this and future occurrences"
 * closes the current version and opens a new one, so past occurrences keep
 * the settings (and history) they had. `effectiveFrom`/`effectiveTo` are the
 * internal window in which a version generates occurrences.
 */
export interface TaskVersion extends TaskFields {
  id: string;
  taskId: string;
  effectiveFrom: DateStr;
  effectiveTo: DateStr | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  position: number;
  /** Set while a recurring task is paused (date the pause started). */
  pausedAt: DateStr | null;
  createdAt: string;
  updatedAt: string;
  versions: TaskVersion[];
}

export interface OccurrenceOverrides {
  title?: string;
  description?: string;
  startTime?: TimeStr | null;
  endTime?: TimeStr | null;
  priority?: Priority;
}

/** Persisted state for one occurrence. Rows exist only once the user interacts. */
export interface OccurrenceRow {
  id: string;
  taskId: string;
  versionId: string | null;
  /** Date the rule generated (identity of the occurrence within its task). */
  originalDate: DateStr;
  /** Date it actually happens on (differs when moved with "only this occurrence"). */
  date: DateStr;
  status: OccurrenceStatus;
  completedAt: string | null;
  overrides: OccurrenceOverrides;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  position: number;
}

/** A fully resolved occurrence, ready to display and count. */
export interface Occurrence {
  key: string;
  taskId: string;
  versionId: string;
  rowId: string | null;
  originalDate: DateStr;
  date: DateStr;
  title: string;
  description: string;
  categoryId: string | null;
  priority: Priority;
  color: string;
  startTime: TimeStr | null;
  endTime: TimeStr | null;
  recurring: boolean;
  status: OccurrenceStatus;
  completedAt: string | null;
  /** Completed in the past but no longer part of the schedule (kept as history). */
  orphan: boolean;
  moved: boolean;
  overridden: boolean;
  position: number;
}

export function occurrenceKey(taskId: string, originalDate: DateStr): string {
  return `${taskId}:${originalDate}`;
}
