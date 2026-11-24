import { authed, json } from "@/server/http";

export const GET = authed(async ({ user }) => json({ user }));
