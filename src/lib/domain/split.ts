import { type DateStr, addDays } from "./dates";
import { expandVersion, versionGenerates, versionWindow } from "./recurrence";
import type { OccurrenceRow, Task, TaskFields, TaskVersion } from "./types";

/**
 * Pure planning of schedule changes. The server applies a plan inside one
 * transaction. The invariant kept by every plan:
 *
 *   Completed occurrences dated today or earlier are history and are never
 *   deleted. Everything else from the change date onward follows the new
 *   schedule.
 */

export interface VersionDraft extends TaskFields {
  id: string;
  effectiveFrom: DateStr;
  effectiveTo: DateStr | null;
}

export interface ChangePlan {
  versionUpdates: { id: string; patch: Partial<Omit<VersionDraft, "id">> }[];
  versionDeletes: string[];
  versionCreate: VersionDraft | null;
  rowUpdates: { id: string; patch: Partial<Pick<OccurrenceRow, "originalDate" | "date" | "versionId">> }[];
  rowDeletes: string[];
  taskPatch: { pausedAt: DateStr | null } | null;
  deleteTask: boolean;
}

function emptyPlan(): ChangePlan {
  return {
    versionUpdates: [],
    versionDeletes: [],
    versionCreate: null,
    rowUpdates: [],
    rowDeletes: [],
    taskPatch: null,
    deleteTask: false,
  };
}

function firstDate(v: TaskVersion, end?: DateStr): DateStr | null {
  const w = versionWindow(v);
  if (!w) return null;
  const last = end ?? w.end ?? addDays(w.start, 800);
  return expandVersion(v, w.start, last < w.start ? w.start : last)[0] ?? null;
}

function versionAfterPatch(v: TaskVersion, patch: Partial<VersionDraft>): TaskVersion {
  return { ...v, ...patch } as TaskVersion;
}

export interface FutureChangeOptions {
  /** First date that follows the new schedule (everything before is untouched). */
  splitDate: DateStr;
  today: DateStr;
  /** New settings from splitDate on, or null to stop the task from splitDate. */
  newFields: TaskFields | null;
  newVersionId: string;
  /** Never delete the whole task (used when pausing). */
  keepTask?: boolean;
}

export function planFutureChange(task: Task, rows: OccurrenceRow[], opts: FutureChangeOptions): ChangePlan {
  const { splitDate, today, newFields, newVersionId } = opts;
  const plan = emptyPlan();
  const before = addDays(splitDate, -1);

  const remaining = new Map<string, TaskVersion>();
  for (const v of task.versions) {
    if (v.effectiveTo && v.effectiveTo < splitDate) {
      remaining.set(v.id, v);
    } else if (v.effectiveFrom < splitDate) {
      plan.versionUpdates.push({ id: v.id, patch: { effectiveTo: before } });
      remaining.set(v.id, versionAfterPatch(v, { effectiveTo: before }));
    } else {
      plan.versionDeletes.push(v.id);
    }
  }

  const created: TaskVersion | null = newFields
    ? ({
        ...newFields,
        id: newVersionId,
        taskId: task.id,
        effectiveFrom: splitDate,
        effectiveTo: null,
        createdAt: "",
        updatedAt: "",
      } satisfies TaskVersion)
    : null;
  if (created) {
    plan.versionCreate = {
      ...newFields!,
      id: newVersionId,
      effectiveFrom: splitDate,
      effectiveTo: null,
    };
  }

  const deleted = new Set(plan.versionDeletes);
  const fallbackVersionId = (): string | null => {
    if (created) return created.id;
    let best: TaskVersion | null = null;
    for (const v of remaining.values()) if (!best || v.effectiveFrom > best.effectiveFrom) best = v;
    return best?.id ?? null;
  };

  const keptRows: OccurrenceRow[] = [];
  for (const row of rows) {
    if (row.taskId !== task.id) continue;
    if (row.originalDate < splitDate) {
      keptRows.push(row);
      if (row.versionId && deleted.has(row.versionId)) {
        plan.rowUpdates.push({ id: row.id, patch: { versionId: fallbackVersionId() } });
      }
      continue;
    }
    if (created && versionGenerates(created, row.originalDate)) {
      keptRows.push(row);
      if (row.versionId !== created.id) plan.rowUpdates.push({ id: row.id, patch: { versionId: created.id } });
      continue;
    }
    if (row.status === "completed" && row.date <= today) {
      keptRows.push(row);
      if (!row.versionId || deleted.has(row.versionId)) {
        plan.rowUpdates.push({ id: row.id, patch: { versionId: fallbackVersionId() } });
      }
      continue;
    }
    plan.rowDeletes.push(row.id);
  }

  // Versions that were cut down to nothing and that no kept row points to are dropped.
  const referenced = new Set<string>();
  for (const r of keptRows) {
    const upd = plan.rowUpdates.find((u) => u.id === r.id);
    const vid = upd && "versionId" in upd.patch ? upd.patch.versionId : r.versionId;
    if (vid) referenced.add(vid);
  }
  for (const upd of [...plan.versionUpdates]) {
    const v = remaining.get(upd.id)!;
    if (firstDate(v) === null && !referenced.has(v.id)) {
      plan.versionUpdates = plan.versionUpdates.filter((u) => u.id !== v.id);
      plan.versionDeletes.push(v.id);
      remaining.delete(v.id);
    }
  }

  const anythingLeft = created !== null || keptRows.length > 0 || [...remaining.values()].some((v) => firstDate(v) !== null);
  if (!anythingLeft) {
    if (opts.keepTask) {
      // Keep one (empty) version so the task can be resumed with its settings.
      const all = [...task.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
      const keep = all.at(-1)!;
      plan.versionDeletes = plan.versionDeletes.filter((id) => id !== keep.id);
      plan.versionUpdates = plan.versionUpdates.filter((u) => u.id !== keep.id);
      plan.versionUpdates.push({ id: keep.id, patch: { effectiveTo: addDays(keep.effectiveFrom, -1) } });
    } else {
      return { ...emptyPlan(), deleteTask: true };
    }
  }
  return plan;
}

/** Edit a one-time task in place (its single occurrence keeps its status). */
export function planOneTimeEdit(task: Task, rows: OccurrenceRow[], newFields: TaskFields, today: DateStr): ChangePlan {
  const plan = emptyPlan();
  const [version, ...others] = [...task.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
  if (!version) throw new Error("Task has no version");
  plan.versionDeletes.push(...others.map((v) => v.id));
  const effectiveFrom = newFields.startDate;
  plan.versionUpdates.push({ id: version.id, patch: { ...newFields, effectiveFrom, effectiveTo: null } });
  const updated = versionAfterPatch(version, { ...newFields, effectiveFrom, effectiveTo: null });
  const oldDate = version.startDate;

  for (const row of rows) {
    if (row.taskId !== task.id) continue;
    if (row.originalDate === oldDate && newFields.recurrence.type === "none") {
      if (row.originalDate !== newFields.startDate || row.date !== newFields.startDate || row.versionId !== version.id) {
        plan.rowUpdates.push({
          id: row.id,
          patch: { originalDate: newFields.startDate, date: newFields.startDate, versionId: version.id },
        });
      }
      continue;
    }
    if (versionGenerates(updated, row.originalDate)) {
      if (row.versionId !== version.id) plan.rowUpdates.push({ id: row.id, patch: { versionId: version.id } });
      continue;
    }
    if (row.status === "completed" && row.date <= today) {
      if (row.versionId !== version.id) plan.rowUpdates.push({ id: row.id, patch: { versionId: version.id } });
      continue;
    }
    plan.rowDeletes.push(row.id);
  }
  return plan;
}

export function planPause(task: Task, rows: OccurrenceRow[], pauseDate: DateStr, today: DateStr): ChangePlan {
  const plan = planFutureChange(task, rows, {
    splitDate: pauseDate,
    today,
    newFields: null,
    newVersionId: "",
    keepTask: true,
  });
  plan.taskPatch = { pausedAt: pauseDate };
  return plan;
}

export function planResume(task: Task, resumeDate: DateStr, newVersionId: string): ChangePlan {
  const plan = emptyPlan();
  const latest = [...task.versions].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)).at(-1);
  if (!latest) throw new Error("Task has no version");
  // Versions that would overlap the resumed schedule are closed first.
  for (const v of task.versions) {
    if (!v.effectiveTo || v.effectiveTo >= resumeDate) {
      if (v.effectiveFrom >= resumeDate) {
        plan.versionUpdates.push({ id: v.id, patch: { effectiveTo: addDays(v.effectiveFrom, -1) } });
      } else {
        plan.versionUpdates.push({ id: v.id, patch: { effectiveTo: addDays(resumeDate, -1) } });
      }
    }
  }
  plan.versionCreate = { ...fieldsOf(latest), id: newVersionId, effectiveFrom: resumeDate, effectiveTo: null };
  plan.taskPatch = { pausedAt: null };
  return plan;
}

/** Fields of the version, without identity/window metadata. */
export function fieldsOf(v: TaskVersion): TaskFields {
  return {
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
  };
}
