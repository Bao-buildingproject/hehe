import { z } from "zod";
import { tooMany } from "@/server/errors";
import { authed, json, readJson } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { createBackup, listBackups } from "@/server/services/backup";

export const GET = authed(async ({ db, user }) => json({ backups: await listBackups(db, user.id) }));

const createSchema = z.object({ label: z.string().trim().min(1).max(80).default("Sao lưu thủ công") });

export const POST = authed(async ({ req, db, user }) => {
  const limit = await consumeRateLimit(db, `backup:${user.id}`, 30, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  const { label } = await readJson(req, createSchema, 4 * 1024);
  const id = await createBackup(db, user.id, label);
  return json({ id, backups: await listBackups(db, user.id) }, { status: 201 });
});
