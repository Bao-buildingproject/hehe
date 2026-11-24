import { authed, json, readJson } from "@/server/http";
import { userToday, uuidParam } from "@/server/params";
import { endTaskFrom } from "@/server/services/tasks";
import { endSeriesSchema } from "@/lib/validation";

/** "Xóa lần này và các lần sau" — past completions stay in the history. */
export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => {
  const { fromDate } = await readJson(req, endSeriesSchema, 4 * 1024);
  return json(await endTaskFrom(db, user.id, uuidParam(params.id), fromDate, userToday(user.timezone)));
});
