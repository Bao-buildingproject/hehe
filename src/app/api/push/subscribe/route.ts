import { z } from "zod";
import { badRequest } from "@/server/errors";
import { authed, json, readJson } from "@/server/http";
import { pushConfigured, removeSubscription, saveSubscription } from "@/server/services/push";
import { pushSubscriptionSchema } from "@/lib/validation";

export const POST = authed(async ({ req, db, user }) => {
  if (!pushConfigured()) throw badRequest("Máy chủ chưa cấu hình Web Push (VAPID)");
  const sub = await readJson(req, pushSubscriptionSchema, 8 * 1024);
  await saveSubscription(db, user.id, sub, req.headers.get("user-agent") ?? "");
  return json({ ok: true });
});

export const DELETE = authed(async ({ req, db, user }) => {
  const { endpoint } = await readJson(req, z.object({ endpoint: z.url().max(2000) }), 8 * 1024);
  await removeSubscription(db, user.id, endpoint);
  return json({ ok: true });
});
