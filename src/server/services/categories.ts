import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Category } from "@/lib/domain/types";
import { type NotificationPrefs, withDefaultPrefs } from "@/lib/settings";
import type { Db } from "../db";
import { categories, users } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";
import { toCategory } from "./mappers";

const MAX_CATEGORIES = 50;

export async function listCategories(db: Db, userId: string): Promise<Category[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.position), asc(categories.createdAt));
  return rows.map(toCategory);
}

async function assertUniqueName(db: Db, userId: string, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`lower(${categories.name}) = lower(${name})`));
  if (rows.some((r) => r.id !== exceptId)) throw conflict("Đã có danh mục cùng tên");
}

export async function createCategory(db: Db, userId: string, input: { name: string; color: string }): Promise<Category> {
  const count = await db.$count(categories, eq(categories.userId, userId));
  if (count >= MAX_CATEGORIES) throw badRequest(`Tối đa ${MAX_CATEGORIES} danh mục`);
  await assertUniqueName(db, userId, input.name);
  const [row] = await db
    .insert(categories)
    .values({ userId, name: input.name, color: input.color, position: count })
    .returning();
  return toCategory(row!);
}

export async function updateCategory(
  db: Db,
  userId: string,
  id: string,
  input: { name: string; color: string },
): Promise<Category> {
  await assertUniqueName(db, userId, input.name, id);
  const [row] = await db
    .update(categories)
    .set({ name: input.name, color: input.color, updatedAt: sql`now()` })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning();
  if (!row) throw notFound("Không tìm thấy danh mục");
  return toCategory(row);
}

/** Tasks in the category keep existing; they simply lose the category. */
export async function deleteCategory(db: Db, userId: string, id: string): Promise<void> {
  const rows = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning({ id: categories.id });
  if (!rows.length) throw notFound("Không tìm thấy danh mục");
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: { name?: string; timezone?: string; notificationPrefs?: NotificationPrefs },
) {
  const patch: Partial<typeof users.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.notificationPrefs !== undefined) patch.notificationPrefs = withDefaultPrefs(input.notificationPrefs);
  if (Object.keys(patch).length === 0) return;
  await db
    .update(users)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(users.id, userId));
}
