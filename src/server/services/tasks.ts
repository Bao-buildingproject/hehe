import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DateStr } from "@/lib/domain/dates";
import { currentVersion, generatingVersion, versionFor } from "@/lib/domain/occurrences";
import { isRecurring } from "@/lib/domain/recurrence";
import {
  type ChangePlan,
  planFutureChange,
  planOneTimeEdit,
  planPause,
  planResume,
} from "@/lib/domain/split";
import type {
  OccurrenceOverrides,
  OccurrenceRow,
  OccurrenceStatus,
  Task,
  TaskFields,
} from "@/lib/domain/types";
import { timeToMinutes } from "@/lib/domain/dates";
import type { Db, DbOrTx, Tx } from "../db";
import { categories, taskOccurrences, taskVersions, tasks } from "../db/schema";
import { badRequest, notFound } from "../errors";
import { toOccurrenceRow, toTask } from "./mappers";

export const MAX_TASKS_PER_USER = 2000;

export interface TaskBundle {
  task: Task | null;
  taskId: string;
  occurrences: OccurrenceRow[];
}

function versionValues(f: TaskFields) {
  return {
    title: f.title,
    description: f.description,
    categoryId: f.categoryId,
    priority: f.priority,
    color: f.color,
    startTime: f.startTime,
    endTime: f.endTime,
    recurrence: f.recurrence,
    startDate: f.startDate,
    untilDate: f.untilDate,
    weeklyTarget: isRecurring(f.recurrence) ? f.weeklyTarget : null,
  };
}

async function assertCategory(db: DbOrTx, userId: string, categoryId: string | null): Promise<void> {
  if (!categoryId) return;
  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!found.length) throw badRequest("Danh mục không tồn tại");
}

export async function loadTaskBundle(db: DbOrTx, userId: string, taskId: string): Promise<TaskBundle> {
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  if (!t) return { task: null, taskId, occurrences: [] };
  const [versions, occ] = await Promise.all([
    db.select().from(taskVersions).where(eq(taskVersions.taskId, taskId)),
    db.select().from(taskOccurrences).where(eq(taskOccurrences.taskId, taskId)),
  ]);
  return { task: toTask(t, versions), taskId, occurrences: occ.map(toOccurrenceRow) };
}

/** Loads a task the user owns and locks it for the rest of the transaction. */
async function lockTask(tx: Tx, userId: string, taskId: string): Promise<{ task: Task; rows: OccurrenceRow[] }> {
  const [t] = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .for("update");
  if (!t) throw notFound("Không tìm thấy công việc");
  const versions = await tx.select().from(taskVersions).where(eq(taskVersions.taskId, taskId));
  const occ = await tx.select().from(taskOccurrences).where(eq(taskOccurrences.taskId, taskId));
  return { task: toTask(t, versions), rows: occ.map(toOccurrenceRow) };
}

async function applyPlan(tx: Tx, userId: string, taskId: string, plan: ChangePlan): Promise<void> {
  if (plan.deleteTask) {
    await tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    return;
  }
  if (plan.rowDeletes.length) {
    await tx
      .delete(taskOccurrences)
      .where(and(eq(taskOccurrences.taskId, taskId), inArray(taskOccurrences.id, plan.rowDeletes)));
  }
  if (plan.versionCreate) {
    const { id, effectiveFrom, effectiveTo, ...fields } = plan.versionCreate;
    await tx.insert(taskVersions).values({ ...versionValues(fields), id, taskId, userId, effectiveFrom, effectiveTo });
  }
  for (const u of plan.rowUpdates) {
    await tx
      .update(taskOccurrences)
      .set({ ...u.patch, updatedAt: sql`now()` })
      .where(and(eq(taskOccurrences.id, u.id), eq(taskOccurrences.taskId, taskId)));
  }
  for (const u of plan.versionUpdates) {
    const patch = { ...u.patch };
    if (patch.recurrence && !isRecurring(patch.recurrence)) patch.weeklyTarget = null;
    await tx
      .update(taskVersions)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(and(eq(taskVersions.id, u.id), eq(taskVersions.taskId, taskId)));
  }
  if (plan.versionDeletes.length) {
    await tx.delete(taskVersions).where(and(eq(taskVersions.taskId, taskId), inArray(taskVersions.id, plan.versionDeletes)));
  }
  await tx
    .update(tasks)
    .set({ ...(plan.taskPatch ?? {}), updatedAt: sql`now()` })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
}

function isOneTime(task: Task): boolean {
  return task.versions.length === 1 && task.versions[0]!.recurrence.type === "none";
}

// ---------------------------------------------------------------------------

export async function createTask(db: Db, userId: string, fields: TaskFields): Promise<TaskBundle> {
  await assertCategory(db, userId, fields.categoryId);
  const count = await db.$count(tasks, eq(tasks.userId, userId));
  if (count >= MAX_TASKS_PER_USER) throw badRequest(`Mỗi tài khoản tối đa ${MAX_TASKS_PER_USER} công việc`);
  const id = await db.transaction(async (tx) => {
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${tasks.position}), 0)` })
      .from(tasks)
      .where(eq(tasks.userId, userId));
    const [t] = await tx
      .insert(tasks)
      .values({ userId, position: Number(max) + 1 })
      .returning({ id: tasks.id });
    await tx.insert(taskVersions).values({
      ...versionValues(fields),
      taskId: t!.id,
      userId,
      effectiveFrom: fields.startDate,
      effectiveTo: null,
    });
    return t!.id;
  });
  return loadTaskBundle(db, userId, id);
}

export type EditInput =
  | { scope: "occurrence"; originalDate: DateStr; date: DateStr; overrides: Partial<OccurrenceOverrides> }
  | { scope: "future"; fromDate: DateStr; fields: TaskFields }
  | { scope: "all"; fields: TaskFields };

export async function editTask(db: Db, userId: string, taskId: string, input: EditInput, today: DateStr): Promise<TaskBundle> {
  if (input.scope !== "occurrence") await assertCategory(db, userId, input.fields.categoryId);
  await db.transaction(async (tx) => {
    const { task, rows } = await lockTask(tx, userId, taskId);

    if (input.scope === "occurrence") {
      await editOccurrence(tx, userId, task, rows, input);
      return;
    }

    let plan: ChangePlan;
    if (isOneTime(task)) {
      plan = planOneTimeEdit(task, rows, input.fields, today);
    } else if (input.scope === "all") {
      throw badRequest('Công việc lặp lại cần chọn "Chỉ lần này" hoặc "Lần này và các lần sau"');
    } else if (task.pausedAt) {
      // While paused, settings are stored on the latest version and used when resuming.
      const latest = currentVersion(task, today);
      plan = {
        versionUpdates: [{ id: latest.id, patch: versionValues(input.fields) }],
        versionDeletes: [],
        versionCreate: null,
        rowUpdates: [],
        rowDeletes: [],
        taskPatch: null,
        deleteTask: false,
      };
    } else {
      // Turning a series into a one-time task on an earlier date must include that date.
      const splitDate =
        input.fields.recurrence.type === "none" && input.fields.startDate < input.fromDate
          ? input.fields.startDate
          : input.fromDate;
      plan = planFutureChange(task, rows, {
        splitDate,
        today,
        newFields: { ...input.fields, weeklyTarget: isRecurring(input.fields.recurrence) ? input.fields.weeklyTarget : null },
        newVersionId: randomUUID(),
      });
    }
    await applyPlan(tx, userId, taskId, plan);
  });
  return loadTaskBundle(db, userId, taskId);
}

async function editOccurrence(
  tx: Tx,
  userId: string,
  task: Task,
  rows: OccurrenceRow[],
  input: Extract<EditInput, { scope: "occurrence" }>,
): Promise<void> {
  const existing = rows.find((r) => r.originalDate === input.originalDate);
  const gen = generatingVersion(task, input.originalDate);
  if (!gen && !existing) throw notFound("Không tìm thấy lần thực hiện này");
  const base =
    gen ??
    (existing?.versionId ? task.versions.find((v) => v.id === existing.versionId) : undefined) ??
    versionFor(task, input.originalDate) ??
    task.versions.at(-1)!;

  const o = input.overrides;
  const overrides: OccurrenceOverrides = {};
  if (o.title !== undefined && o.title !== base.title) overrides.title = o.title;
  if (o.description !== undefined && o.description !== base.description) overrides.description = o.description;
  if (o.priority !== undefined && o.priority !== base.priority) overrides.priority = o.priority;
  const st = o.startTime === undefined ? base.startTime : o.startTime;
  const et = o.endTime === undefined ? base.endTime : o.endTime;
  if (et && !st) throw badRequest("Nhập giờ bắt đầu trước khi chọn giờ kết thúc");
  if (st && et && timeToMinutes(et) <= timeToMinutes(st)) throw badRequest("Giờ kết thúc phải sau giờ bắt đầu");
  if (st !== base.startTime || et !== base.endTime) {
    overrides.startTime = st ?? null;
    overrides.endTime = et ?? null;
  }

  await tx
    .insert(taskOccurrences)
    .values({
      userId,
      taskId: task.id,
      versionId: base.id,
      originalDate: input.originalDate,
      date: input.date,
      status: existing?.status ?? "pending",
      completedAt: existing?.completedAt ?? null,
      overrides,
    })
    .onConflictDoUpdate({
      target: [taskOccurrences.taskId, taskOccurrences.originalDate],
      set: { date: input.date, overrides, versionId: base.id, updatedAt: sql`now()` },
    });
}

export async function setOccurrenceStatus(
  db: Db,
  userId: string,
  taskId: string,
  originalDate: DateStr,
  status: OccurrenceStatus,
): Promise<OccurrenceRow> {
  return db.transaction(async (tx) => {
    const { task, rows } = await lockTask(tx, userId, taskId);
    const existing = rows.find((r) => r.originalDate === originalDate);
    const gen = generatingVersion(task, originalDate);
    if (!gen && !existing) throw notFound("Không tìm thấy lần thực hiện này");
    const versionId = gen?.id ?? existing?.versionId ?? null;
    const completed = status === "completed";
    const [row] = await tx
      .insert(taskOccurrences)
      .values({
        userId,
        taskId,
        versionId,
        originalDate,
        date: existing?.date ?? originalDate,
        status,
        completedAt: completed ? sql`now()` : null,
        overrides: existing?.overrides ?? {},
      })
      .onConflictDoUpdate({
        target: [taskOccurrences.taskId, taskOccurrences.originalDate],
        set: {
          status,
          // Keep the first completion time when "completed" is sent twice.
          completedAt: completed ? sql`coalesce(${taskOccurrences.completedAt}, now())` : null,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    await tx.update(tasks).set({ updatedAt: sql`now()` }).where(eq(tasks.id, taskId));
    return toOccurrenceRow(row!);
  });
}

export async function pauseTask(db: Db, userId: string, taskId: string, fromDate: DateStr, today: DateStr): Promise<TaskBundle> {
  if (fromDate < today) throw badRequest("Chỉ có thể tạm dừng từ hôm nay trở đi");
  await db.transaction(async (tx) => {
    const { task, rows } = await lockTask(tx, userId, taskId);
    if (isOneTime(task)) throw badRequest("Chỉ tạm dừng được công việc lặp lại");
    if (task.pausedAt) throw badRequest("Công việc này đang tạm dừng");
    await applyPlan(tx, userId, taskId, planPause(task, rows, fromDate, today));
  });
  return loadTaskBundle(db, userId, taskId);
}

export async function resumeTask(db: Db, userId: string, taskId: string, fromDate: DateStr, today: DateStr): Promise<TaskBundle> {
  await db.transaction(async (tx) => {
    const { task } = await lockTask(tx, userId, taskId);
    if (!task.pausedAt) throw badRequest("Công việc này không ở trạng thái tạm dừng");
    if (fromDate < today) throw badRequest("Ngày tiếp tục phải từ hôm nay trở đi");
    if (fromDate < task.pausedAt) throw badRequest("Ngày tiếp tục phải sau ngày bắt đầu tạm dừng");
    await applyPlan(tx, userId, taskId, planResume(task, fromDate, randomUUID()));
  });
  return loadTaskBundle(db, userId, taskId);
}

/** "Xóa lần này và các lần sau": stops the series; completed history is kept. */
export async function endTaskFrom(db: Db, userId: string, taskId: string, fromDate: DateStr, today: DateStr): Promise<TaskBundle> {
  await db.transaction(async (tx) => {
    const { task, rows } = await lockTask(tx, userId, taskId);
    await applyPlan(
      tx,
      userId,
      taskId,
      planFutureChange(task, rows, { splitDate: fromDate, today, newFields: null, newVersionId: "" }),
    );
  });
  return loadTaskBundle(db, userId, taskId);
}

export async function deleteTask(db: Db, userId: string, taskId: string): Promise<void> {
  const deleted = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  if (!deleted.length) throw notFound("Không tìm thấy công việc");
}

export async function reorderTasks(db: Db, userId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw badRequest("Danh sách sắp xếp bị trùng");
  const values = sql.join(
    unique.map((id, i) => sql`(${id}::uuid, ${i + 1}::double precision)`),
    sql`, `,
  );
  await db.execute(sql`
    update tasks set position = v.position, updated_at = now()
    from (values ${values}) as v(id, position)
    where tasks.id = v.id and tasks.user_id = ${userId}
  `);
}
