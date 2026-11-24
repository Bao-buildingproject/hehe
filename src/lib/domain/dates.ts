/**
 * Plain calendar-date helpers.
 *
 * Every date in the domain layer is a `DateStr` ("YYYY-MM-DD") that means a
 * calendar day in the user's timezone. Arithmetic is done on integer day
 * numbers (days since 1970-01-01, computed with Date.UTC), so results never
 * depend on the timezone or DST rules of the machine running the code.
 */

export type DateStr = string; // "YYYY-MM-DD"
export type TimeStr = string; // "HH:MM" (24h)
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDateStr(value: unknown): value is DateStr {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function isValidTimeStr(value: unknown): value is TimeStr {
  return typeof value === "string" && TIME_RE.test(value);
}

export function parseDate(date: DateStr): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: ${date}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function makeDate(y: number, m: number, d: number): DateStr {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function toDayNum(date: DateStr): number {
  const { y, m, d } = parseDate(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n: number): DateStr {
  const dt = new Date(n * DAY_MS);
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: DateStr, days: number): DateStr {
  return fromDayNum(toDayNum(date) + days);
}

/** Number of days from `a` to `b` (positive when b is later). */
export function diffDays(a: DateStr, b: DateStr): number {
  return toDayNum(b) - toDayNum(a);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

export function weekdayOf(date: DateStr): Weekday {
  const n = toDayNum(date);
  return ((((n % 7) + 7 + 3) % 7) + 1) as Weekday;
}

/** Monday of the week containing `date` (weeks run Monday → Sunday). */
export function startOfWeek(date: DateStr): DateStr {
  return addDays(date, 1 - weekdayOf(date));
}

export function endOfWeek(date: DateStr): DateStr {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: DateStr): DateStr {
  const { y, m } = parseDate(date);
  return makeDate(y, m, 1);
}

export function endOfMonth(date: DateStr): DateStr {
  const { y, m } = parseDate(date);
  return makeDate(y, m, daysInMonth(y, m));
}

export function startOfYear(date: DateStr): DateStr {
  return makeDate(parseDate(date).y, 1, 1);
}

export function endOfYear(date: DateStr): DateStr {
  return makeDate(parseDate(date).y, 12, 31);
}

/** Adds months, clamping the day to the target month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: DateStr, months: number): DateStr {
  const { y, m, d } = parseDate(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(date: DateStr, years: number): DateStr {
  return addMonths(date, years * 12);
}

export function monthsBetween(a: DateStr, b: DateStr): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: DateStr, b: DateStr): DateStr {
  return a < b ? a : b;
}

export function maxDate(a: DateStr, b: DateStr): DateStr {
  return a > b ? a : b;
}

export function isBetween(date: DateStr, start: DateStr, end: DateStr): boolean {
  return date >= start && date <= end;
}

export function eachDay(start: DateStr, end: DateStr): DateStr[] {
  const out: DateStr[] = [];
  const s = toDayNum(start);
  const e = toDayNum(end);
  for (let n = s; n <= e; n++) out.push(fromDayNum(n));
  return out;
}

/** ISO-8601 week number and week-year. */
export function isoWeek(date: DateStr): { year: number; week: number } {
  const thursday = addDays(startOfWeek(date), 3);
  const year = parseDate(thursday).y;
  const week = Math.floor(diffDays(makeDate(year, 1, 1), thursday) / 7) + 1;
  return { year, week };
}

/** Six-week grid (Monday-first) that covers the month of `date`. */
export function monthGrid(date: DateStr): DateStr[] {
  const first = startOfWeek(startOfMonth(date));
  return eachDay(first, addDays(first, 41));
}

export function timeToMinutes(time: TimeStr): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

export function minutesToTime(minutes: number): TimeStr {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Timezone-aware "now"
// ---------------------------------------------------------------------------

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    partsFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

export interface NowContext {
  /** Calendar date in the user's timezone. */
  today: DateStr;
  /** Minutes since local midnight in the user's timezone. */
  minutes: number;
}

export function nowContext(timeZone: string, instant: Date = new Date()): NowContext {
  const p = zonedParts(instant, timeZone);
  return { today: makeDate(p.y, p.m, p.d), minutes: p.hour * 60 + p.minute };
}

export function todayIn(timeZone: string, instant: Date = new Date()): DateStr {
  return nowContext(timeZone, instant).today;
}

/** Converts a wall-clock date/time in `timeZone` to the matching UTC instant. */
export function zonedDateTimeToInstant(date: DateStr, time: TimeStr, timeZone: string): Date {
  const { y, m, d } = parseDate(date);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh!, mm!);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
    const delta = wallAsUtc - seenAsUtc;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}
