import { z } from "zod";
import { tooMany } from "@/server/errors";
import { authed, json, readJson } from "@/server/http";
import { consumeRateLimit } from "@/server/rate-limit";
import { importData, importFileSchema } from "@/server/services/backup";

const bodySchema = z.object({
  mode: z.enum(["merge", "replace"]),
  data: importFileSchema,
});

export const POST = authed(async ({ req, db, user }) => {
  const limit = await consumeRateLimit(db, `import:${user.id}`, 20, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  const { mode, data } = await readJson(req, bodySchema, 10 * 1024 * 1024);
  return json({ result: await importData(db, user.id, data, mode) });
});
