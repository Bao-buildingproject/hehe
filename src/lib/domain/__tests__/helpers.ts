import type { DateStr, TimeStr } from "../dates";
import type { OccurrenceRow, OccurrenceStatus, Recurrence, Task, TaskFields, TaskVersion } from "../types";

let seq = 0;
export const uid = (prefix = "id") => `${prefix}-${++seq}`;

export function fields(partial: Partial<TaskFields> = {}): TaskFields {
  return {
    title: "Việc",
    description: "",
    categoryId: null,
    priority: "medium",
    color: "#3b82f6",
    startTime: null,
    endTime: null,
    recurrence: { type: "none" },
    startDate: "2026-11-23",
    untilDate: null,
    weeklyTarget: null,
    ...partial,
  };
}

export function version(taskId: string, partial: Partial<TaskVersion> = {}): TaskVersion {
  const f = fields(partial);
  return {
    ...f,
    id: partial.id ?? uid("v"),
    taskId,
    effectiveFrom: partial.effectiveFrom ?? f.startDate,
    effectiveTo: partial.effectiveTo ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function task(
  partial: Partial<TaskFields> & { id?: string; position?: number; pausedAt?: DateStr | null } = {},
): Task {
  const id = partial.id ?? uid("t");
  return {
    id,
    position: partial.position ?? 0,
    pausedAt: partial.pausedAt ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    versions: [version(id, partial)],
  };
}

export function habit(title: string, recurrence: Recurrence, startDate: DateStr, extra: Partial<TaskFields> = {}): Task {
  return task({ title, recurrence, startDate, ...extra });
}

export function row(
  t: Task,
  originalDate: DateStr,
  status: OccurrenceStatus = "completed",
  extra: Partial<OccurrenceRow> = {},
): OccurrenceRow {
  return {
    id: extra.id ?? uid("r"),
    taskId: t.id,
    versionId: extra.versionId ?? t.versions[0]!.id,
    originalDate,
    date: extra.date ?? originalDate,
    status,
    completedAt: status === "completed" ? "2026-11-23T12:00:00.000Z" : null,
    overrides: extra.overrides ?? {},
    createdAt: "2026-11-23T12:00:00.000Z",
    updatedAt: "2026-11-23T12:00:00.000Z",
  };
}

export const now = (today: DateStr, time: TimeStr = "12:00") => {
  const [h, m] = time.split(":").map(Number);
  return { today, minutes: h! * 60 + m! };
};
