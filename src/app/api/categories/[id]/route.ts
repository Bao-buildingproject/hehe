import { authed, json, readJson } from "@/server/http";
import { uuidParam } from "@/server/params";
import { deleteCategory, updateCategory } from "@/server/services/categories";
import { categorySchema } from "@/lib/validation";

type Params = { id: string };

export const PATCH = authed<Params>(async ({ req, db, user, params }) => {
  const input = await readJson(req, categorySchema, 4 * 1024);
  return json({ category: await updateCategory(db, user.id, uuidParam(params.id, "Không tìm thấy danh mục"), input) });
});

export const DELETE = authed<Params>(async ({ db, user, params }) => {
  await deleteCategory(db, user.id, uuidParam(params.id, "Không tìm thấy danh mục"));
  return json({ ok: true });
});
