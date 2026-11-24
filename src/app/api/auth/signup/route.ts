import { sessionCookie } from "@/server/auth";
import { tooMany } from "@/server/errors";
import { clientIp, json, open, readJson } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { signup } from "@/server/services/account";
import { signupSchema } from "@/lib/validation";

export const POST = open(async ({ req, db }) => {
  const limit = await consumeRateLimit(db, `signup:ip:${clientIp(req)}`, 10, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  const input = await readJson(req, signupSchema, 8 * 1024);
  const { token, expiresAt } = await signup(db, input);
  const res = json({ ok: true }, { status: 201 });
  res.cookies.set(sessionCookie(token, expiresAt));
  return res;
});
