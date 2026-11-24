import "server-only";
import { nowContext } from "@/lib/domain/dates";
import { notFound } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route ids must be UUIDs; anything else is simply "not found". */
export function uuidParam(value: string | undefined, what = "Không tìm thấy dữ liệu"): string {
  if (!value || !UUID_RE.test(value)) throw notFound(what);
  return value.toLowerCase();
}

export function userToday(timezone: string) {
  return nowContext(timezone).today;
}
