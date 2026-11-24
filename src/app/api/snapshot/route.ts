import { authed, json } from "@/server/http";
import { loadSnapshot } from "@/server/services/snapshot";

export const GET = authed(async ({ db, user }) => json(await loadSnapshot(db, user.id)));
