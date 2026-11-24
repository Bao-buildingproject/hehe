import { sessionCookie } from "@/server/auth";
import { tooMany } from "@/server/errors";
import { clientIp, json, open, readJson } from "@/server/http";
import { consumeRateLimit, resetRateLimit } from "@/server/rate-limit";
import { login } from "@/server/services/account";
import { loginSchema } from "@/lib/validation";

export const POST = open(async ({ req, db }) => {
  const ipLimit = await consumeRateLimit(db, `login:ip:${clientIp(req)}`, 30, 900);
  if (!ipLimit.allowed) throw tooMany(ipLimit.retryAfterSeconds);
  const input = await readJson(req, loginSchema, 8 * 1024);
  const emailKey = `login:email:${input.email}`;
  const emailLimit = await consumeRateLimit(db, emailKey, 10, 900);
  if (!emailLimit.allowed) throw tooMany(emailLimit.retryAfterSeconds);
  const { token, expiresAt } = await login(db, input);
  await resetRateLimit(db, emailKey);
  const res = json({ ok: true });
  res.cookies.set(sessionCookie(token, expiresAt));
  return res;
});
