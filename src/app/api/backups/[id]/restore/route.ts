import { tooMany } from "@/server/errors";
import { authed, json } from "@/server/http";
import { uuidParam } from "@/server/params";
import { consumeRateLimit } from "@/server/rate-limit";
import { restoreBackup } from "@/server/services/backup";

/** Replaces all current data with the backup (an automatic backup of the current state is made first). */
export const POST = authed<{ id: string }>(async ({ db, user, params }) => {
  const limit = await consumeRateLimit(db, `import:${user.id}`, 20, 3600);
  if (!limit.allowed) throw tooMany(limit.retryAfterSeconds);
  return json({ result: await restoreBackup(db, user.id, uuidParam(params.id, "Không tìm thấy bản sao lưu")) });
});
