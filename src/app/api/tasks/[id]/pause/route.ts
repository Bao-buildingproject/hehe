import { authed, json, readJson } from "@/server/http";
import { userToday, uuidParam } from "@/server/params";
import { pauseTask } from "@/server/services/tasks";
import { pauseSchema } from "@/lib/validation";

export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => {
  const { fromDate } = await readJson(req, pauseSchema, 4 * 1024);
  return json(await pauseTask(db, user.id, uuidParam(params.id), fromDate, userToday(user.timezone)));
});
