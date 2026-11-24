import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { sessions, users } from "./db/schema";

// ---------------------------------------------------------------------------
// Passwords: scrypt (memory-hard, built into Node — no native dependency).
// ---------------------------------------------------------------------------

const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 96 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, params = SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password.normalize("NFKC"),
      salt,
      params.keylen,
      { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64!, "base64");
  const key = await scrypt(password, Buffer.from(saltB64!, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    keylen: expected.length,
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Spends the same time as a real check so unknown emails can't be detected by timing. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummyHash);
}

// ---------------------------------------------------------------------------
// Sessions: random token in an httpOnly cookie, only its SHA-256 in the database.
// ---------------------------------------------------------------------------

export const SESSION_TTL_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;
const DAY_MS = 86_400_000;

export const secureCookies = process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1";
export const SESSION_COOKIE = secureCookies ? "__Host-mlp_session" : "mlp_session";
/** Both names, so the proxy recognises either. */
export const SESSION_COOKIE_NAMES = ["__Host-mlp_session", "mlp_session"];

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(db: DbOrTx, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  // Opportunistic cleanup of this user's expired sessions.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  timezone: string;
}

export interface ValidatedSession {
  user: SessionUser;
  /** Set when the expiry was extended and the cookie must be refreshed. */
  renewedUntil: Date | null;
}

export async function validateSessionToken(db: DbOrTx, token: string | undefined | null): Promise<ValidatedSession | null> {
  if (!token || token.length > 200) return null;
  const id = hashToken(token);
  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, email: users.email, name: users.name, timezone: users.timezone },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const found = rows[0];
  if (!found) return null;
  let renewedUntil: Date | null = null;
  if (found.expiresAt.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * DAY_MS) {
    renewedUntil = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS);
    await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  }
  return { user: found.user, renewedUntil };
}

export async function invalidateSession(db: DbOrTx, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function invalidateUserSessions(db: DbOrTx, userId: string, exceptToken?: string): Promise<void> {
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  const keep = exceptToken ? hashToken(exceptToken) : null;
  for (const s of all) if (s.id !== keep) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie("", new Date(0)), maxAge: 0 };
}
