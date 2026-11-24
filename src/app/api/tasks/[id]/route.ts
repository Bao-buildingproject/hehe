import { authed, json, readJson } from "@/server/http";
import { userToday, uuidParam } from "@/server/params";
import { deleteTask, editTask } from "@/server/services/tasks";
import { editTaskSchema } from "@/lib/validation";

type Params = { id: string };

export const PATCH = authed<Params>(async ({ req, db, user, params }) => {
  const id = uuidParam(params.id, "Không tìm thấy công việc");
  const input = await readJson(req, editTaskSchema);
  return json(await editTask(db, user.id, id, input, userToday(user.timezone)));
});

export const DELETE = authed<Params>(async ({ db, user, params }) => {
  await deleteTask(db, user.id, uuidParam(params.id, "Không tìm thấy công việc"));
  return json({ ok: true });
});
