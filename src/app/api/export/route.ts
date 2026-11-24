import { NextResponse } from "next/server";
import { todayIn } from "@/lib/domain/dates";
import { authed } from "@/server/http";
import { exportData, exportOccurrencesCsv, exportTasksCsv } from "@/server/services/backup";

function download(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = authed(async ({ req, db, user }) => {
  const format = req.nextUrl.searchParams.get("format") ?? "json";
  const type = req.nextUrl.searchParams.get("type") ?? "occurrences";
  const stamp = todayIn(user.timezone);
  if (format === "csv") {
    if (type === "tasks") {
      return download(await exportTasksCsv(db, user.id), `my-life-planner-cong-viec-${stamp}.csv`, "text/csv; charset=utf-8");
    }
    return download(await exportOccurrencesCsv(db, user.id), `my-life-planner-lich-su-${stamp}.csv`, "text/csv; charset=utf-8");
  }
  const data = await exportData(db, user.id);
  return download(JSON.stringify(data, null, 2), `my-life-planner-sao-luu-${stamp}.json`, "application/json; charset=utf-8");
});
