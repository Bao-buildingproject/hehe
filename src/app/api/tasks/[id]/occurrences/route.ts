import { authed, json, readJson } from "@/server/http";
import { uuidParam } from "@/server/params";
import { setOccurrenceStatus } from "@/server/services/tasks";
import { setOccurrenceSchema } from "@/lib/validation";

/** Tick / untick / skip / cancel one occurrence. Idempotent: sending the same status twice is harmless. */
export const PUT = authed<{ id: string }>(async ({ req, db, user, params }) => {
  const id = uuidParam(params.id, "Không tìm thấy công việc");
  const { originalDate, status } = await readJson(req, setOccurrenceSchema, 4 * 1024);
  return json({ occurrence: await setOccurrenceStatus(db, user.id, id, originalDate, status) });
});
