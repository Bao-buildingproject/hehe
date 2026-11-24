import { authed, json, readJson } from "@/server/http";
import { updateProfile } from "@/server/services/categories";
import { loadSnapshot } from "@/server/services/snapshot";
import { profileSchema } from "@/lib/validation";

export const PATCH = authed(async ({ req, db, user }) => {
  const input = await readJson(req, profileSchema, 8 * 1024);
  await updateProfile(db, user.id, input);
  const snap = await loadSnapshot(db, user.id);
  return json({ user: snap.user });
});
