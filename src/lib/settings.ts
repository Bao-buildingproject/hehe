import type { TimeStr } from "./domain/dates";

export interface NotificationPrefs {
  /** Remind N minutes before a task's start time. */
  beforeStart: { enabled: boolean; minutes: number };
  /** At a set time, list today's tasks that are still not done. */
  unfinished: { enabled: boolean; time: TimeStr };
  /** End-of-day reminder to review progress. */
  dailyReview: { enabled: boolean; time: TimeStr };
  /** Sunday evening weekly summary. */
  weeklySummary: { enabled: boolean; time: TimeStr };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  beforeStart: { enabled: true, minutes: 15 },
  unfinished: { enabled: true, time: "20:00" },
  dailyReview: { enabled: false, time: "21:30" },
  weeklySummary: { enabled: true, time: "20:00" },
};

export const REMINDER_MINUTE_OPTIONS = [5, 10, 15, 30, 60] as const;

export function withDefaultPrefs(prefs: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return {
    beforeStart: { ...DEFAULT_NOTIFICATION_PREFS.beforeStart, ...prefs?.beforeStart },
    unfinished: { ...DEFAULT_NOTIFICATION_PREFS.unfinished, ...prefs?.unfinished },
    dailyReview: { ...DEFAULT_NOTIFICATION_PREFS.dailyReview, ...prefs?.dailyReview },
    weeklySummary: { ...DEFAULT_NOTIFICATION_PREFS.weeklySummary, ...prefs?.weeklySummary },
  };
}

export const DEFAULT_CATEGORIES = [
  { name: "Học tập", color: "#6366f1" },
  { name: "Công việc", color: "#0ea5e9" },
  { name: "Sức khỏe", color: "#10b981" },
  { name: "Cá nhân", color: "#f59e0b" },
] as const;

/** Palette offered in the task form (works on light and dark backgrounds). */
export const TASK_COLORS = [
  "#6366f1",
  "#3b82f6",
  "#0ea5e9",
  "#14b8a6",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#ec4899",
  "#a855f7",
  "#64748b",
] as const;
