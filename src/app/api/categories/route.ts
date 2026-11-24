import { authed, json, readJson } from "@/server/http";
import { createCategory, listCategories } from "@/server/services/categories";
import { categorySchema } from "@/lib/validation";

export const GET = authed(async ({ db, user }) => json({ categories: await listCategories(db, user.id) }));

export const POST = authed(async ({ req, db, user }) => {
  const input = await readJson(req, categorySchema, 4 * 1024);
  return json({ category: await createCategory(db, user.id, input) }, { status: 201 });
});
