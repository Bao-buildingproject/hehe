import { authed, json, readJson } from "@/server/http";
import { userToday, uuidParam } from "@/server/params";
import { resumeTask } from "@/server/services/tasks";
import { resumeSchema } from "@/lib/validation";

export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => {
  const { fromDate } = await readJson(req, resumeSchema, 4 * 1024);
  return json(await resumeTask(db, user.id, uuidParam(params.id), fromDate, userToday(user.timezone)));
});
