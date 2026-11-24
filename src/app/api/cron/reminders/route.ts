import { timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import { json, open } from "@/server/http";
import { runReminderCron } from "@/server/services/push";

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Called by a scheduler every 5 minutes (GitHub Actions, cron-job.org or Vercel Cron)
 * with "Authorization: Bearer <CRON_SECRET>". Sends due reminders through Web Push.
 */
async function handle(req: Request) {
  if (!authorized(req.headers.get("authorization"))) throw new AppError(401, "Unauthorized", "unauthorized");
}

export const GET = open(
  async ({ req, db }) => {
    await handle(req);
    return json(await runReminderCron(db));
  },
  { sameOrigin: false },
);

export const POST = GET;
