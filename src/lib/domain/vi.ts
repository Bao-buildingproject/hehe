import { type DateStr, type Weekday, addDays, isoWeek, parseDate, weekdayOf } from "./dates";
import type { DisplayStatus, OccurrenceStatus, Priority, Recurrence, TaskFields } from "./types";

export const WEEKDAY_LONG: Record<Weekday, string> = {
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
  7: "Chủ Nhật",
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
  7: "CN",
};

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  completed: "Hoàn thành",
  in_progress: "Đang thực hiện",
  overdue: "Quá hạn",
  upcoming: "Chưa thực hiện",
  skipped: "Bỏ qua",
  cancelled: "Đã hủy",
};

export const STORED_STATUS_LABEL: Record<OccurrenceStatus, string> = {
  pending: "Chưa thực hiện",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
  skipped: "Bỏ qua",
  cancelled: "Đã hủy",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(date: DateStr, style: "short" | "full" | "long" | "dayMonth" = "full"): string {
  const { y, m, d } = parseDate(date);
  switch (style) {
    case "dayMonth":
      return `${pad(d)}/${pad(m)}`;
    case "short":
      return `${WEEKDAY_SHORT[weekdayOf(date)]}, ${pad(d)}/${pad(m)}`;
    case "long":
      return `${WEEKDAY_LONG[weekdayOf(date)]}, ${pad(d)}/${pad(m)}/${y}`;
    default:
      return `${pad(d)}/${pad(m)}/${y}`;
  }
}

export function monthLabel(date: DateStr): string {
  const { y, m } = parseDate(date);
  return `Tháng ${m}, ${y}`;
}

export function weekLabel(weekStart: DateStr): string {
  const end = addDays(weekStart, 6);
  const { week } = isoWeek(weekStart);
  const s = parseDate(weekStart);
  const e = parseDate(end);
  const range =
    s.y === e.y ? `${pad(s.d)}/${pad(s.m)} – ${pad(e.d)}/${pad(e.m)}/${e.y}` : `${formatDate(weekStart)} – ${formatDate(end)}`;
  return `Tuần ${week} · ${range}`;
}

const percentFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** 0.818 → "81,8%". */
export function formatPercent(rate: number | null | undefined, empty = "—"): string {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return empty;
  return `${percentFormat.format(rate * 100)}%`;
}

/** 0.12 → "+12 điểm %". */
export function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  const pts = Math.round(delta * 1000) / 10;
  if (pts === 0) return "±0 điểm %";
  return `${pts > 0 ? "+" : "−"}${percentFormat.format(Math.abs(pts))} điểm %`;
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && end) return `${start} – ${end}`;
  return start ? `từ ${start}` : `đến ${end}`;
}

function listWeekdays(days: Weekday[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === "1,2,3,4,5") return "Thứ Hai đến Thứ Sáu";
  if (key === "6,7") return "cuối tuần (T7, CN)";
  if (key === "1,2,3,4,5,6,7") return "mọi ngày trong tuần";
  if (sorted.length === 1) return WEEKDAY_LONG[sorted[0]!];
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

const NTH_LABEL: Record<string, string> = { "1": "đầu tiên", "2": "thứ hai", "3": "thứ ba", "4": "thứ tư", "-1": "cuối cùng" };

export function describeRule(rule: Recurrence): string {
  switch (rule.type) {
    case "none":
      return "Không lặp lại";
    case "daily":
      return rule.interval === 1 ? "Hằng ngày" : `Mỗi ${rule.interval} ngày`;
    case "weekly": {
      const days = listWeekdays(rule.weekdays);
      if (rule.interval === 1) return rule.weekdays.length === 7 ? "Hằng ngày" : `Hằng tuần vào ${days}`;
      return `Mỗi ${rule.interval} tuần vào ${days}`;
    }
    case "monthly": {
      const every = rule.interval === 1 ? "Hằng tháng" : `Mỗi ${rule.interval} tháng`;
      if (rule.monthly.mode === "dayOfMonth") {
        const tail = rule.monthly.day > 28 ? " (tháng ngắn hơn: ngày cuối tháng)" : "";
        return `${every} vào ngày ${rule.monthly.day}${tail}`;
      }
      return `${every} vào ${WEEKDAY_LONG[rule.monthly.weekday]} ${NTH_LABEL[String(rule.monthly.nth)]}`;
    }
  }
}

export function describeSchedule(fields: Pick<TaskFields, "recurrence" | "startDate" | "untilDate">): string {
  if (fields.recurrence.type === "none") return `Một lần vào ${formatDate(fields.startDate, "long")}`;
  const parts = [describeRule(fields.recurrence), `từ ${formatDate(fields.startDate)}`];
  if (fields.untilDate) parts.push(`đến ${formatDate(fields.untilDate)}`);
  return parts.join(" · ");
}

/** Short summary for lists, e.g. "T2, T4, T6 · 19:00 – 21:00". */
export function shortSchedule(fields: Pick<TaskFields, "recurrence" | "startDate" | "startTime" | "endTime">): string {
  const rule = fields.recurrence;
  let when: string;
  if (rule.type === "none") when = formatDate(fields.startDate, "short");
  else if (rule.type === "weekly" && rule.interval === 1) when = listWeekdays(rule.weekdays);
  else when = describeRule(rule);
  const time = formatTimeRange(fields.startTime, fields.endTime);
  return time ? `${when} · ${time}` : when;
}

export function streakUnit(unit: "day" | "time", n: number): string {
  return unit === "day" ? `${n} ngày` : `${n} lần`;
}
