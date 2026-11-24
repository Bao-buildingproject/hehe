import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { DEFAULT_CATEGORIES, DEFAULT_NOTIFICATION_PREFS } from "@/lib/settings";
import {
  burnPasswordCheck,
  createSession,
  hashPassword,
  invalidateUserSessions,
  verifyPassword,
} from "../auth";
import type { Db } from "../db";
import { categories, users } from "../db/schema";
import { AppError, badRequest, conflict, notFound } from "../errors";
import { logEvent } from "../log";

export async function signup(db: Db, input: { name: string; email: string; password: string }) {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing.length) throw conflict("Email này đã được đăng ký. Hãy đăng nhập.");
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email,
          name: input.name,
          passwordHash,
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        })
        .returning({ id: users.id });
      await tx.insert(categories).values(
        DEFAULT_CATEGORIES.map((c, i) => ({ userId: user!.id, name: c.name, color: c.color, position: i })),
      );
      const session = await createSession(tx, user!.id);
      logEvent("info", "signup", { userId: user!.id });
      return { userId: user!.id, ...session };
    });
  } catch (error) {
    // Two sign-ups racing for the same email.
    if (error instanceof Error && /users_email_key/.test(error.message + String((error as { cause?: unknown }).cause))) {
      throw conflict("Email này đã được đăng ký. Hãy đăng nhập.");
    }
    throw error;
  }
}

export async function login(db: Db, input: { email: string; password: string }) {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (!user) {
    await burnPasswordCheck(input.password);
    logEvent("warn", "login_failed", { reason: "unknown_email" });
    throw new AppError(401, "Email hoặc mật khẩu không đúng", "invalid_credentials");
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    logEvent("warn", "login_failed", { userId: user.id, reason: "bad_password" });
    throw new AppError(401, "Email hoặc mật khẩu không đúng", "invalid_credentials");
  }
  const session = await createSession(db, user.id);
  logEvent("info", "login", { userId: user.id });
  return { userId: user.id, ...session };
}

export async function changePassword(db: Db, userId: string, current: string, next: string, keepToken: string) {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound("Tài khoản không tồn tại");
  if (!(await verifyPassword(current, user.passwordHash))) throw badRequest("Mật khẩu hiện tại không đúng");
  if (current === next) throw badRequest("Mật khẩu mới phải khác mật khẩu hiện tại");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), updatedAt: sql`now()` })
    .where(eq(users.id, userId));
  // Sign out every other device.
  await invalidateUserSessions(db, userId, keepToken);
  logEvent("info", "password_changed", { userId });
}

export async function deleteAccount(db: Db, userId: string, password: string) {
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound("Tài khoản không tồn tại");
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest("Mật khẩu không đúng");
  await db.delete(users).where(and(eq(users.id, userId)));
  logEvent("info", "account_deleted", { userId });
}
