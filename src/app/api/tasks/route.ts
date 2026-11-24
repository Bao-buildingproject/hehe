import { authed, json, readJson } from "@/server/http";
import { createTask } from "@/server/services/tasks";
import { createTaskSchema } from "@/lib/validation";

export const POST = authed(async ({ req, db, user }) => {
  const { fields } = await readJson(req, createTaskSchema);
  return json(await createTask(db, user.id, fields), { status: 201 });
});
