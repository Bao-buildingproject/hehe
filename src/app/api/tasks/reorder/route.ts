import { authed, json, readJson } from "@/server/http";
import { reorderTasks } from "@/server/services/tasks";
import { reorderSchema } from "@/lib/validation";

export const PUT = authed(async ({ req, db, user }) => {
  const { ids } = await readJson(req, reorderSchema);
  await reorderTasks(db, user.id, ids);
  return json({ ok: true });
});
