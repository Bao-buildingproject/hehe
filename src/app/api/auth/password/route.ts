import { tooMany } from "@/server/errors";
import { authed, json, readJson } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { changePassword } from "@/server/services/account";
import { changePasswordSchema } from "@/lib/validation";

export const POST = authed(async ({ req, db, user, token }) => {
  const limit = await consumeRateLimit(db, `password:${user.id}`, 10, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  const input = await readJson(req, changePasswordSchema, 8 * 1024);
  await changePassword(db, user.id, input.currentPassword, input.newPassword, token);
  return json({ ok: true });
});
