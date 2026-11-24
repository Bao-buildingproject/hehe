import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb(url: string) {
  const client = postgres(url, {
    // Small pool: serverless functions run many instances in parallel.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    // Works behind transaction-mode poolers (Neon, Supabase pgbouncer).
    prepare: false,
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __mlpDb?: ReturnType<typeof createDb> };

/** Lazily creates one connection pool per process. */
export function getDb(): Db {
  if (!globalForDb.__mlpDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL chưa được cấu hình. Xem hướng dẫn trong README.");
    }
    globalForDb.__mlpDb = createDb(url);
  }
  return globalForDb.__mlpDb.db;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__mlpDb) {
    await globalForDb.__mlpDb.client.end({ timeout: 5 });
    globalForDb.__mlpDb = undefined;
  }
}

export { schema };
