import { clearedSessionCookie, invalidateSession } from "@/server/auth";
import { json, open, readSessionToken } from "@/server/http";

export const POST = open(async ({ req, db }) => {
  const token = readSessionToken(req);
  if (token) await invalidateSession(db, token);
  const res = json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
});
