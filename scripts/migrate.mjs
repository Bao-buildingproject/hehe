// Applies pending SQL migrations from ./drizzle. Runs before `next build`.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Local development: read .env.local when the variables are not already set.
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // no .env.local — fine on Vercel/CI where variables come from the environment
  }
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) {
  if (process.env.SKIP_DB_MIGRATE === "1") {
    console.log("[migrate] SKIP_DB_MIGRATE=1 → bỏ qua migration.");
    process.exit(0);
  }
  console.error(
    "[migrate] Thiếu DATABASE_URL. Hãy kết nối cơ sở dữ liệu PostgreSQL (xem README, mục “Đưa lên mạng”) " +
      "hoặc đặt SKIP_DB_MIGRATE=1 nếu chỉ muốn build thử.",
  );
  process.exit(1);
}

const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("[migrate] Cơ sở dữ liệu đã cập nhật.");
} catch (error) {
  console.error("[migrate] Lỗi khi chạy migration:", error);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
