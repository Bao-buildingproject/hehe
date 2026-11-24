import { clearedSessionCookie } from "@/server/auth";
import { tooMany } from "@/server/errors";
import { authed, json, readJson } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { deleteAccount } from "@/server/services/account";
import { deleteAccountSchema } from "@/lib/validation";

export const POST = authed(async ({ req, db, user }) => {
  const limit = await consumeRateLimit(db, `delete-account:${user.id}`, 5, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  const { password } = await readJson(req, deleteAccountSchema, 8 * 1024);
  await deleteAccount(db, user.id, password);
  const res = json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
});
