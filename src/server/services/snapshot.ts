import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Category, OccurrenceRow, Task } from "@/lib/domain/types";
import { type NotificationPrefs, withDefaultPrefs } from "@/lib/settings";
import type { DbOrTx } from "../db";
import { categories, taskOccurrences, taskVersions, tasks, users } from "../db/schema";
import { notFound } from "../errors";
import { toCategory, toOccurrenceRow, toTask } from "./mappers";

export interface SnapshotUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
  notificationPrefs: NotificationPrefs;
}

/** Everything the client needs to compute calendars and statistics locally. */
export interface Snapshot {
  user: SnapshotUser;
  categories: Category[];
  tasks: Task[];
  occurrences: OccurrenceRow[];
  serverTime: string;
  push: { publicKey: string | null };
}

export async function loadUserTasks(db: DbOrTx, userId: string): Promise<Task[]> {
  const [taskRows, versionRows] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(asc(tasks.position), asc(tasks.createdAt)),
    db.select().from(taskVersions).where(eq(taskVersions.userId, userId)),
  ]);
  return taskRows.map((t) => toTask(t, versionRows));
}

export async function loadUserOccurrences(db: DbOrTx, userId: string): Promise<OccurrenceRow[]> {
  const rows = await db.select().from(taskOccurrences).where(eq(taskOccurrences.userId, userId));
  return rows.map(toOccurrenceRow);
}

export async function loadSnapshot(db: DbOrTx, userId: string): Promise<Snapshot> {
  const [userRows, categoryRows, taskList, occurrences] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        timezone: users.timezone,
        notificationPrefs: users.notificationPrefs,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.position), asc(categories.createdAt)),
    loadUserTasks(db, userId),
    loadUserOccurrences(db, userId),
  ]);
  const user = userRows[0];
  if (!user) throw notFound("Tài khoản không tồn tại");
  return {
    user: { ...user, notificationPrefs: withDefaultPrefs(user.notificationPrefs) },
    categories: categoryRows.map(toCategory),
    tasks: taskList,
    occurrences,
    serverTime: new Date().toISOString(),
    push: { publicKey: process.env.VAPID_PUBLIC_KEY || null },
  };
}
