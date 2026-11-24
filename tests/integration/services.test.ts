/**
 * Service-level tests against a real PostgreSQL database.
 * They WIPE the database, so they only run against a database whose name ends with "_test":
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/planner_test npm run test:integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { addDays, startOfWeek, todayIn } from "@/lib/domain/dates";
import { buildOccurrences, createIndex } from "@/lib/domain/occurrences";
import { weekSummary } from "@/lib/domain/stats";
import type { TaskFields } from "@/lib/domain/types";
import { validateSessionToken } from "@/server/auth";
import { closeDb, getDb } from "@/server/db";
import { AppError } from "@/server/errors";
import { consumeRateLimit } from "@/server/rate-limit";
import { login, signup } from "@/server/services/account";
import { createBackup, exportData, importData, importFileSchema, listBackups, restoreBackup } from "@/server/services/backup";
import { deleteCategory } from "@/server/services/categories";
import { loadSnapshot } from "@/server/services/snapshot";
import {
  createTask,
  deleteTask,
  editTask,
  endTaskFrom,
  pauseTask,
  reorderTasks,
  resumeTask,
  setOccurrenceStatus,
} from "@/server/services/tasks";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !new URL(testUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL phải trỏ tới cơ sở dữ liệu có tên kết thúc bằng _test (bài test sẽ xóa dữ liệu).");
}
if (testUrl) process.env.DATABASE_URL = testUrl;
const hasDb = Boolean(testUrl);
const TZ = "Asia/Ho_Chi_Minh";

function fields(partial: Partial<TaskFields>): TaskFields {
  return {
    title: "Việc",
    description: "",
    categoryId: null,
    priority: "medium",
    color: "#6366f1",
    startTime: null,
    endTime: null,
    recurrence: { type: "none" },
    startDate: todayIn(TZ),
    untilDate: null,
    weeklyTarget: null,
    ...partial,
  };
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

describe.skipIf(!hasDb)("services on PostgreSQL", () => {
  const db = hasDb ? getDb() : (null as never);
  let alice = "";
  let bob = "";
  const today = todayIn(TZ);

  beforeAll(async () => {
    await db.execute(sql`truncate users, rate_limits cascade`);
    alice = (await signup(db, { name: "Alice", email: "alice@example.com", password: "mat-khau-alice" })).userId;
    bob = (await signup(db, { name: "Bob", email: "bob@example.com", password: "mat-khau-bob-123" })).userId;
  });

  afterAll(async () => {
    if (hasDb) await closeDb();
  });

  it("signs up with default categories and rejects duplicate emails", async () => {
    const snap = await loadSnapshot(db, alice);
    expect(snap.categories.map((c) => c.name)).toEqual(["Học tập", "Công việc", "Sức khỏe", "Cá nhân"]);
    expect(snap.user.timezone).toBe(TZ);
    await expectStatus(signup(db, { name: "", email: "alice@example.com", password: "khac-mat-khau" }), 409);
  });

  it("logs in with the right password only; session tokens validate", async () => {
    await expectStatus(login(db, { email: "alice@example.com", password: "sai-mat-khau" }), 401);
    await expectStatus(login(db, { email: "nobody@example.com", password: "sai-mat-khau" }), 401);
    const { token } = await login(db, { email: "alice@example.com", password: "mat-khau-alice" });
    const session = await validateSessionToken(db, token);
    expect(session?.user.id).toBe(alice);
    expect(await validateSessionToken(db, token + "x")).toBeNull();
  });

  it("keeps accounts isolated", async () => {
    const created = await createTask(db, alice, fields({ title: "Học CFA", recurrence: { type: "daily", interval: 1 } }));
    const taskId = created.task!.id;
    const bobSnap = await loadSnapshot(db, bob);
    expect(bobSnap.tasks).toHaveLength(0);
    await expectStatus(setOccurrenceStatus(db, bob, taskId, today, "completed"), 404);
    await expectStatus(editTask(db, bob, taskId, { scope: "all", fields: fields({ title: "Hack" }) }, today), 404);
    await expectStatus(deleteTask(db, bob, taskId), 404);
    await expectStatus(pauseTask(db, bob, taskId, today, today), 404);
    // Bob cannot attach Alice's category to his own task.
    const aliceCategory = (await loadSnapshot(db, alice)).categories[0]!.id;
    await expectStatus(createTask(db, bob, fields({ categoryId: aliceCategory })), 400);
    await reorderTasks(db, bob, [taskId]);
    const stillAlice = await loadSnapshot(db, alice);
    expect(stillAlice.tasks.find((t) => t.id === taskId)?.versions[0]!.title).toBe("Học CFA");
    await deleteTask(db, alice, taskId);
  });

  it("tick → untick → tick keeps one row and the first completion time", async () => {
    const { task } = await createTask(db, alice, fields({ title: "Đọc sách", recurrence: { type: "daily", interval: 1 } }));
    const first = await setOccurrenceStatus(db, alice, task!.id, today, "completed");
    const again = await setOccurrenceStatus(db, alice, task!.id, today, "completed");
    expect(again.completedAt).toBe(first.completedAt);
    const undone = await setOccurrenceStatus(db, alice, task!.id, today, "pending");
    expect(undone.completedAt).toBeNull();
    await setOccurrenceStatus(db, alice, task!.id, today, "completed");
    const rows = await db.execute<{ n: number }>(sql`select count(*)::int as n from task_occurrences where task_id = ${task!.id}`);
    expect(Number(rows[0]!.n)).toBe(1);
    // Dates the task never generates are rejected.
    await expectStatus(setOccurrenceStatus(db, alice, task!.id, addDays(today, -400), "completed"), 404);
    await deleteTask(db, alice, task!.id);
  });

  it("editing 'this and future' preserves completed history", async () => {
    const start = addDays(startOfWeek(today), -14);
    const { task } = await createTask(
      db,
      alice,
      fields({ title: "Gym", recurrence: { type: "weekly", interval: 1, weekdays: [1, 3, 5] }, startDate: start, startTime: "06:00" }),
    );
    const id = task!.id;
    await setOccurrenceStatus(db, alice, id, start, "completed");
    await setOccurrenceStatus(db, alice, id, addDays(start, 2), "completed");
    const edited = await editTask(
      db,
      alice,
      id,
      {
        scope: "future",
        fromDate: today,
        fields: fields({
          title: "Gym tối",
          recurrence: { type: "weekly", interval: 1, weekdays: [2, 4] },
          startDate: start,
          startTime: "19:00",
        }),
      },
      today,
    );
    expect(edited.task!.versions.length).toBeGreaterThanOrEqual(2);
    const index = createIndex([edited.task!], edited.occurrences);
    const past = buildOccurrences(index, start, addDays(start, 6));
    expect(past.filter((o) => o.status === "completed").map((o) => o.title)).toEqual(["Gym", "Gym"]);
    const future = buildOccurrences(index, today, addDays(today, 13));
    expect(future.every((o) => o.title === "Gym tối" && o.startTime === "19:00")).toBe(true);
    expect(future.every((o) => [2, 4].includes(new Date(o.date + "T00:00:00Z").getUTCDay()))).toBe(true);

    // Pause from today, then resume: the history is still there.
    const paused = await pauseTask(db, alice, id, today, today);
    expect(paused.task!.pausedAt).toBe(today);
    expect(buildOccurrences(createIndex([paused.task!], paused.occurrences), today, addDays(today, 13))).toHaveLength(0);
    const resumed = await resumeTask(db, alice, id, today, today);
    expect(resumed.task!.pausedAt).toBeNull();
    expect(buildOccurrences(createIndex([resumed.task!], resumed.occurrences), start, addDays(start, 6)).filter((o) => o.status === "completed")).toHaveLength(2);

    // Stop the series from today: completed history remains.
    const ended = await endTaskFrom(db, alice, id, today, today);
    expect(ended.task).not.toBeNull();
    expect(buildOccurrences(createIndex([ended.task!], ended.occurrences), today, addDays(today, 30))).toHaveLength(0);
    await deleteTask(db, alice, id);
  });

  it("weekly summary from stored data matches the formula", async () => {
    const monday = startOfWeek(today);
    const { task } = await createTask(
      db,
      alice,
      fields({ title: "Học tiếng Anh", recurrence: { type: "daily", interval: 1 }, startDate: addDays(monday, -7), weeklyTarget: 5 }),
    );
    for (const d of [0, 1, 2, 4, 5]) await setOccurrenceStatus(db, alice, task!.id, addDays(monday, d - 7), "completed");
    const snap = await loadSnapshot(db, alice);
    const s = weekSummary(createIndex(snap.tasks, snap.occurrences), addDays(monday, -7), { today, minutes: 600 });
    expect(s.stats).toMatchObject({ scheduled: 7, completed: 5 });
    expect(s.habits[0]).toMatchObject({ completed: 5, target: 5, targetMet: true });
    await deleteTask(db, alice, task!.id);
  });

  it("exports, merges, backs up and restores", async () => {
    const { task } = await createTask(db, alice, fields({ title: "Báo cáo tài chính" }));
    await setOccurrenceStatus(db, alice, task!.id, today, "completed");
    const file = importFileSchema.parse(JSON.parse(JSON.stringify(await exportData(db, alice))));
    expect(file.tasks).toHaveLength(1);

    const merged = await importData(db, alice, file, "merge");
    expect(merged).toMatchObject({ tasks: 1, occurrences: 1, categories: 0 });
    expect((await loadSnapshot(db, alice)).tasks).toHaveLength(2);

    const backupId = await createBackup(db, alice, "Thử");
    await deleteTask(db, alice, task!.id);
    expect((await loadSnapshot(db, alice)).tasks).toHaveLength(1);
    const restored = await restoreBackup(db, alice, backupId);
    expect(restored.tasks).toBe(2);
    const snap = await loadSnapshot(db, alice);
    expect(snap.tasks).toHaveLength(2);
    expect(snap.occurrences.filter((o) => o.status === "completed")).toHaveLength(2);
    // Restoring made an automatic backup of the previous state first.
    expect((await listBackups(db, alice)).map((b) => b.label)).toContain("Tự động trước khi khôi phục");
    // Bob cannot restore Alice's backup.
    await expectStatus(restoreBackup(db, bob, backupId), 404);
    for (const t of snap.tasks) await deleteTask(db, alice, t.id);
  });

  it("deleting a category keeps its tasks", async () => {
    const cat = (await loadSnapshot(db, alice)).categories[1]!;
    const { task } = await createTask(db, alice, fields({ title: "Họp", categoryId: cat.id }));
    await deleteCategory(db, alice, cat.id);
    const snap = await loadSnapshot(db, alice);
    expect(snap.tasks.find((t) => t.id === task!.id)?.versions[0]!.categoryId).toBeNull();
    await deleteTask(db, alice, task!.id);
  });

  it("rate limits with a fixed window", async () => {
    for (let i = 0; i < 3; i++) expect((await consumeRateLimit(db, "test:key", 3, 60)).allowed).toBe(true);
    expect((await consumeRateLimit(db, "test:key", 3, 60)).allowed).toBe(false);
  });
});
