import { NextResponse } from "next/server";
import { authed, json } from "@/server/http";
import { uuidParam } from "@/server/params";
import { deleteBackup, getBackupData } from "@/server/services/backup";

type Params = { id: string };

/** Download a stored backup as a JSON file. */
export const GET = authed<Params>(async ({ db, user, params }) => {
  const data = await getBackupData(db, user.id, uuidParam(params.id, "Không tìm thấy bản sao lưu"));
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-life-planner-backup-${params.id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

export const DELETE = authed<Params>(async ({ db, user, params }) => {
  await deleteBackup(db, user.id, uuidParam(params.id, "Không tìm thấy bản sao lưu"));
  return json({ ok: true });
});
