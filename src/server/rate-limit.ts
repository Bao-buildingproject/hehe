import "server-only";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter stored in Postgres, so it works across serverless
 * instances. One atomic upsert per call.
 */
export async function consumeRateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.execute<{ count: number; window_start: string }>(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else rate_limits.window_start end
    returning count, window_start
  `);
  const row = rows[0]!;
  const count = Number(row.count);
  const started = new Date(row.window_start).getTime();
  const retryAfterSeconds = Math.max(1, Math.ceil((started + windowSeconds * 1000 - Date.now()) / 1000));
  return { allowed: count <= limit, count, retryAfterSeconds };
}

export async function resetRateLimit(db: DbOrTx, key: string): Promise<void> {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}
