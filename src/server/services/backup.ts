import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type DateStr, endOfMonth, nowContext, weekdayOf, zonedParts } from "@/lib/domain/dates";
import { buildOccurrences, createIndex, currentVersion, displayStatus, taskSpan } from "@/lib/domain/occurrences";
import { PRIORITY_LABEL, STATUS_LABEL, WEEKDAY_LONG, describeSchedule, formatDate } from "@/lib/domain/vi";
import { withDefaultPrefs } from "@/lib/settings";
import {
  colorSchema,
  dateSchema,
  notificationPrefsSchema,
  occurrenceStatusSchema,
  prioritySchema,
  recurrenceSchema,
  timeSchema,
} from "@/lib/validation";
import type { Db, DbOrTx, Tx } from "../db";
import { backups, categories, taskOccurrences, taskVersions, tasks, users } from "../db/schema";
import { badRequest, notFound } from "../errors";
import { logEvent } from "../log";
import { loadSnapshot } from "./snapshot";

export const EXPORT_FORMAT = "my-life-planner";
const MAX_BACKUPS = 10;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportData(db: DbOrTx, userId: string) {
  const snap = await loadSnapshot(db, userId);
  return {
    format: EXPORT_FORMAT,
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    profile: { name: snap.user.name, timezone: snap.user.timezone, notificationPrefs: snap.user.notificationPrefs },
    categories: snap.categories,
    tasks: snap.tasks.map((t) => ({
      id: t.id,
      position: t.position,
      pausedAt: t.pausedAt,
      createdAt: t.createdAt,
      versions: t.versions.map(({ taskId: _taskId, ...v }) => v),
    })),
    occurrences: snap.occurrences.map(({ id: _id, createdAt: _c, updatedAt: _u, ...o }) => o),
  };
}

export type ExportFile = Awaited<ReturnType<typeof exportData>>;

function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Spreadsheet formula injection guard.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number | null)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function formatInstant(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  const p = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.hour)}:${pad(p.minute)}`;
}

export async function exportOccurrencesCsv(db: Db, userId: string): Promise<string> {
  const snap = await loadSnapshot(db, userId);
  const now = nowContext(snap.user.timezone);
  const header = ["Ngày", "Thứ", "Công việc", "Danh mục", "Ưu tiên", "Bắt đầu", "Kết thúc", "Lặp lại", "Trạng thái", "Hoàn thành lúc"];
  let start: DateStr | null = null;
  for (const t of snap.tasks) {
    const span = taskSpan(t);
    if (span && (!start || span.start < start)) start = span.start;
  }
  for (const r of snap.occurrences) if (!start || r.date < start) start = r.date;
  if (!start) return toCsv([header]);
  const end = endOfMonth(now.today);
  const occs = buildOccurrences(createIndex(snap.tasks, snap.occurrences), start, end < start ? start : end);
  const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  return toCsv([
    header,
    ...occs.map((o) => [
      formatDate(o.date),
      WEEKDAY_LONG[weekdayOf(o.date)],
      o.title,
      o.categoryId ? (cats.get(o.categoryId) ?? "") : "",
      PRIORITY_LABEL[o.priority],
      o.startTime,
      o.endTime,
      o.recurring ? "Có" : "Không",
      STATUS_LABEL[displayStatus(o, now)],
      formatInstant(o.completedAt, snap.user.timezone),
    ]),
  ]);
}

export async function exportTasksCsv(db: Db, userId: string): Promise<string> {
  const snap = await loadSnapshot(db, userId);
  const today = nowContext(snap.user.timezone).today;
  const cats = new Map(snap.categories.map((c) => [c.id, c.name]));
  const header = ["Công việc", "Mô tả", "Danh mục", "Ưu tiên", "Lịch", "Giờ", "Mục tiêu/tuần", "Trạng thái", "Tạo lúc"];
  return toCsv([
    header,
    ...snap.tasks.map((t) => {
      const v = currentVersion(t, today);
      const span = taskSpan(t);
      const state = t.pausedAt ? "Tạm dừng" : span && (span.end === null || span.end >= today) ? "Đang áp dụng" : "Đã kết thúc";
      return [
        v.title,
        v.description,
        v.categoryId ? (cats.get(v.categoryId) ?? "") : "",
        PRIORITY_LABEL[v.priority],
        describeSchedule(v),
        v.startTime ? `${v.startTime}${v.endTime ? ` – ${v.endTime}` : ""}` : "",
        v.weeklyTarget,
        state,
        formatInstant(t.createdAt, snap.user.timezone),
      ];
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Import / restore
// ---------------------------------------------------------------------------

const id = z.string().min(1).max(100);
const isoTimestamp = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), "Thời điểm không hợp lệ");

const importVersion = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  categoryId: id.nullable().default(null),
  priority: prioritySchema.default("medium"),
  color: colorSchema,
  startTime: timeSchema.nullable().default(null),
  endTime: timeSchema.nullable().default(null),
  recurrence: recurrenceSchema,
  startDate: dateSchema,
  untilDate: dateSchema.nullable().default(null),
  weeklyTarget: z.number().int().min(1).max(7).nullable().default(null),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().default(null),
});

export const importFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT, "Đây không phải file sao lưu của MY LIFE PLANNER"),
  version: z.literal(1, "Phiên bản file sao lưu không được hỗ trợ"),
  profile: z
    .object({
      name: z.string().max(80).optional(),
      timezone: z.string().max(64).optional(),
      notificationPrefs: notificationPrefsSchema.optional(),
    })
    .optional(),
  categories: z
    .array(z.object({ id, name: z.string().trim().min(1).max(40), color: colorSchema, position: z.number().int().default(0) }))
    .max(50)
    .default([]),
  tasks: z
    .array(
      z.object({
        id,
        position: z.number().finite().default(0),
        pausedAt: dateSchema.nullable().default(null),
        versions: z.array(importVersion).min(1).max(200),
      }),
    )
    .max(2000)
    .default([]),
  occurrences: z
    .array(
      z.object({
        taskId: id,
        versionId: id.nullable().default(null),
        originalDate: dateSchema,
        date: dateSchema,
        status: occurrenceStatusSchema,
        completedAt: isoTimestamp.nullable().default(null),
        overrides: z
          .object({
            title: z.string().trim().min(1).max(200).optional(),
            description: z.string().max(5000).optional(),
            startTime: timeSchema.nullable().optional(),
            endTime: timeSchema.nullable().optional(),
            priority: prioritySchema.optional(),
          })
          .default({}),
      }),
    )
    .max(200_000)
    .default([]),
});

export type ImportFile = z.output<typeof importFileSchema>;

export interface ImportResult {
  categories: number;
  tasks: number;
  occurrences: number;
  backupId: string | null;
}

async function createBackupTx(tx: DbOrTx, userId: string, label: string): Promise<string> {
  const data = await exportData(tx, userId);
  const json = JSON.stringify(data);
  const [row] = await tx
    .insert(backups)
    .values({ userId, label, data, sizeBytes: Buffer.byteLength(json, "utf8") })
    .returning({ id: backups.id });
  // Keep only the newest backups.
  const old = await tx
    .select({ id: backups.id })
    .from(backups)
    .where(eq(backups.userId, userId))
    .orderBy(desc(backups.createdAt))
    .offset(MAX_BACKUPS);
  if (old.length) {
    await tx.delete(backups).where(and(eq(backups.userId, userId), inArray(backups.id, old.map((o) => o.id))));
  }
  return row!.id;
}

async function importIntoTx(tx: Tx, userId: string, file: ImportFile, mode: "merge" | "replace"): Promise<ImportResult> {
  let backupId: string | null = null;
  if (mode === "replace") {
    backupId = await createBackupTx(tx, userId, "Tự động trước khi khôi phục");
    await tx.delete(tasks).where(eq(tasks.userId, userId));
    await tx.delete(categories).where(eq(categories.userId, userId));
    if (file.profile) {
      await tx
        .update(users)
        .set({
          ...(file.profile.name !== undefined ? { name: file.profile.name } : {}),
          ...(file.profile.notificationPrefs ? { notificationPrefs: withDefaultPrefs(file.profile.notificationPrefs) } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(users.id, userId));
    }
  }

  const existing = await tx.select().from(categories).where(eq(categories.userId, userId));
  const catMap = new Map<string, string>();
  let createdCategories = 0;
  let catPosition = existing.length;
  for (const c of file.categories) {
    const same = existing.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
    if (same) {
      catMap.set(c.id, same.id);
      continue;
    }
    if (existing.length + createdCategories >= 50) throw badRequest("Vượt quá 50 danh mục");
    const [row] = await tx
      .insert(categories)
      .values({ userId, name: c.name, color: c.color, position: catPosition++ })
      .returning({ id: categories.id });
    catMap.set(c.id, row!.id);
    createdCategories++;
  }

  const [{ count, max }] = await tx
    .select({ count: sql<number>`count(*)::int`, max: sql<number>`coalesce(max(${tasks.position}), 0)` })
    .from(tasks)
    .where(eq(tasks.userId, userId));
  if (Number(count) + file.tasks.length > 2000) throw badRequest("Vượt quá 2000 công việc");

  const taskMap = new Map<string, string>();
  const versionMap = new Map<string, string>();
  const sorted = [...file.tasks].sort((a, b) => a.position - b.position);
  let pos = Number(max);
  for (const t of sorted) {
    const [row] = await tx
      .insert(tasks)
      .values({ userId, position: ++pos, pausedAt: t.pausedAt })
      .returning({ id: tasks.id });
    taskMap.set(t.id, row!.id);
    for (const v of t.versions) {
      if (v.startTime && v.endTime && v.endTime <= v.startTime) throw badRequest(`Công việc "${v.title}" có giờ không hợp lệ`);
      const [vr] = await tx
        .insert(taskVersions)
        .values({
          taskId: row!.id,
          userId,
          title: v.title,
          description: v.description,
          categoryId: v.categoryId ? (catMap.get(v.categoryId) ?? null) : null,
          priority: v.priority,
          color: v.color,
          startTime: v.startTime,
          endTime: v.endTime,
          recurrence: v.recurrence,
          startDate: v.startDate,
          untilDate: v.untilDate,
          weeklyTarget: v.recurrence.type === "none" ? null : v.weeklyTarget,
          effectiveFrom: v.effectiveFrom,
          effectiveTo: v.effectiveTo,
        })
        .returning({ id: taskVersions.id });
      versionMap.set(v.id, vr!.id);
    }
  }

  let occCount = 0;
  const values = file.occurrences
    .filter((o) => taskMap.has(o.taskId))
    .map((o) => ({
      userId,
      taskId: taskMap.get(o.taskId)!,
      versionId: o.versionId ? (versionMap.get(o.versionId) ?? null) : null,
      originalDate: o.originalDate,
      date: o.date,
      status: o.status,
      completedAt: o.status === "completed" ? (o.completedAt ?? `${o.date}T12:00:00.000Z`) : null,
      overrides: o.overrides,
    }));
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const inserted = await tx
      .insert(taskOccurrences)
      .values(chunk)
      .onConflictDoNothing({ target: [taskOccurrences.taskId, taskOccurrences.originalDate] })
      .returning({ id: taskOccurrences.id });
    occCount += inserted.length;
  }

  return { categories: createdCategories, tasks: taskMap.size, occurrences: occCount, backupId };
}

export async function importData(db: Db, userId: string, file: ImportFile, mode: "merge" | "replace"): Promise<ImportResult> {
  const result = await db.transaction((tx) => importIntoTx(tx, userId, file, mode));
  logEvent("info", "data_imported", { userId, mode, tasks: result.tasks, occurrences: result.occurrences });
  return result;
}

export async function createBackup(db: Db, userId: string, label: string) {
  const backupId = await createBackupTx(db, userId, label);
  logEvent("info", "backup_created", { userId });
  return backupId;
}

export async function listBackups(db: Db, userId: string) {
  const rows = await db
    .select({ id: backups.id, label: backups.label, sizeBytes: backups.sizeBytes, createdAt: backups.createdAt })
    .from(backups)
    .where(eq(backups.userId, userId))
    .orderBy(desc(backups.createdAt));
  return rows.map((r) => ({ ...r, createdAt: new Date(r.createdAt.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")).toISOString() }));
}

export async function getBackupData(db: Db, userId: string, backupId: string): Promise<unknown> {
  const [row] = await db
    .select({ data: backups.data })
    .from(backups)
    .where(and(eq(backups.id, backupId), eq(backups.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Không tìm thấy bản sao lưu");
  return row.data;
}

export async function restoreBackup(db: Db, userId: string, backupId: string): Promise<ImportResult> {
  const data = await getBackupData(db, userId, backupId);
  const parsed = importFileSchema.safeParse(data);
  if (!parsed.success) throw badRequest("Bản sao lưu bị hỏng, không thể khôi phục");
  const result = await importData(db, userId, parsed.data, "replace");
  logEvent("info", "backup_restored", { userId });
  return result;
}

export async function deleteBackup(db: Db, userId: string, backupId: string): Promise<void> {
  const rows = await db
    .delete(backups)
    .where(and(eq(backups.id, backupId), eq(backups.userId, userId)))
    .returning({ id: backups.id });
  if (!rows.length) throw notFound("Không tìm thấy bản sao lưu");
}
