import "server-only";
import type { Category, OccurrenceRow, Task, TaskVersion } from "@/lib/domain/types";
import type { categories, taskOccurrences, taskVersions, tasks } from "../db/schema";

/** Postgres text timestamps ("2026-11-24 16:50:00.12+00") → ISO 8601. */
export function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

type TaskRow = typeof tasks.$inferSelect;
type VersionRow = typeof taskVersions.$inferSelect;
type OccRow = typeof taskOccurrences.$inferSelect;
type CategoryRow = typeof categories.$inferSelect;

export function toVersion(v: VersionRow): TaskVersion {
  return {
    id: v.id,
    taskId: v.taskId,
    title: v.title,
    description: v.description,
    categoryId: v.categoryId,
    priority: v.priority,
    color: v.color,
    startTime: v.startTime,
    endTime: v.endTime,
    recurrence: v.recurrence,
    startDate: v.startDate,
    untilDate: v.untilDate,
    weeklyTarget: v.weeklyTarget,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    createdAt: toIso(v.createdAt)!,
    updatedAt: toIso(v.updatedAt)!,
  };
}

export function toTask(t: TaskRow, versions: VersionRow[]): Task {
  return {
    id: t.id,
    position: t.position,
    pausedAt: t.pausedAt,
    createdAt: toIso(t.createdAt)!,
    updatedAt: toIso(t.updatedAt)!,
    versions: versions
      .filter((v) => v.taskId === t.id)
      .map(toVersion)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0)),
  };
}

export function toOccurrenceRow(o: OccRow): OccurrenceRow {
  return {
    id: o.id,
    taskId: o.taskId,
    versionId: o.versionId,
    originalDate: o.originalDate,
    date: o.date,
    status: o.status,
    completedAt: toIso(o.completedAt),
    overrides: o.overrides ?? {},
    createdAt: toIso(o.createdAt)!,
    updatedAt: toIso(o.updatedAt)!,
  };
}

export function toCategory(c: CategoryRow): Category {
  return { id: c.id, name: c.name, color: c.color, position: c.position };
}
