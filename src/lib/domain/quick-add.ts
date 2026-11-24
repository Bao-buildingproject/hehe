/**
 * Rule-based Vietnamese parser for the "Hôm nay bạn muốn làm gì?" box.
 * It works without any AI service: it recognises dates, times, durations,
 * repetition and weekly targets, and returns a draft the user confirms.
 *
 * Matching runs on a diacritic-folded copy of the text that has exactly the
 * same length as the original, so every match maps back to the original
 * characters (which are then removed from the title).
 */
import {
  type DateStr,
  type TimeStr,
  type Weekday,
  addDays,
  daysInMonth,
  diffDays,
  isValidDateStr,
  makeDate,
  minutesToTime,
  parseDate,
  startOfWeek,
  timeToMinutes,
  weekdayOf,
} from "./dates";
import { normalizeWeekdays } from "./recurrence";
import type { Priority, Recurrence } from "./types";

export type CategoryHint = "study" | "work" | "health" | "personal";

export interface QuickAddDraft {
  title: string;
  date: DateStr;
  startTime: TimeStr | null;
  endTime: TimeStr | null;
  durationMinutes: number | null;
  recurrence: Recurrence;
  untilDate: DateStr | null;
  weeklyTarget: number | null;
  priority: Priority;
  categoryHint: CategoryHint | null;
  /** Human-readable notes about what was recognised or ignored. */
  notes: string[];
}

const B = "(?<![a-z0-9])";
const E = "(?![a-z0-9])";

function foldChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xd800 && code <= 0xdfff) return ch;
  let c = ch.normalize("NFD").replace(/\p{M}/gu, "");
  c = c.replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  if (c.length === 1) return c;
  const lower = ch.toLowerCase();
  return lower.length === 1 ? lower : " ";
}

class Scanner {
  readonly original: string;
  readonly lower: string;
  folded: string;
  private readonly removed: boolean[];
  readonly accented: boolean;

  constructor(input: string) {
    this.original = input.normalize("NFC");
    let folded = "";
    let lower = "";
    for (let i = 0; i < this.original.length; i++) {
      const ch = this.original[i]!;
      folded += foldChar(ch);
      const l = ch.toLowerCase();
      lower += l.length === 1 ? l : ch;
    }
    this.folded = folded;
    this.lower = lower;
    this.removed = new Array(this.original.length).fill(false);
    this.accented = /[^\u0000-\u007f]/.test(this.original);
  }

  /** Original (lower-cased) text of a span. */
  text(start: number, end: number): string {
    return this.lower.slice(start, end);
  }

  consume(start: number, end: number): void {
    this.folded = this.folded.slice(0, start) + " ".repeat(end - start) + this.folded.slice(end);
    for (let i = start; i < end; i++) this.removed[i] = true;
  }

  /** First match of `source` whose `accept` check passes; the match is consumed. */
  take(source: string, accept?: (m: RegExpExecArray) => boolean): RegExpExecArray | null {
    const re = new RegExp(source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.folded))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (!accept || accept(m)) {
        this.consume(m.index, m.index + m[0].length);
        return m;
      }
    }
    return null;
  }

  remainder(): string {
    let out = "";
    for (let i = 0; i < this.original.length; i++) out += this.removed[i] ? " " : this.original[i];
    return out;
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const WD_WORD = "(?:[2-7]|hai|ba|tu|nam|sau|bay)";
const WD_TOKEN = `(?:thu ?${WD_WORD}|t[2-7]|chu ?nhat|cn)`;
const WD_BARE = `(?:(?:thu ?|t)?${WD_WORD}|chu ?nhat|cn)`;

const WORD_TO_WEEKDAY: Record<string, Weekday> = {
  "2": 1,
  hai: 1,
  "3": 2,
  ba: 2,
  "4": 3,
  tu: 3,
  "5": 4,
  nam: 4,
  "6": 5,
  sau: 5,
  "7": 6,
  bay: 6,
};

/** Accented spellings that make an ambiguous weekday word acceptable. */
const WEEKDAY_ACCENTED: Record<string, string> = { tu: "tư", nam: "năm", sau: "sáu", bay: "bảy" };

function weekdayFromToken(sc: Scanner, token: string, offset: number): Weekday | null {
  const t = token.trim();
  if (/^(chu ?nhat|cn)$/.test(t)) return 7;
  const m = /^(?:thu ?|t)?([2-7]|hai|ba|tu|nam|sau|bay)$/.exec(t);
  if (!m) return null;
  const word = m[1]!;
  if (sc.accented && WEEKDAY_ACCENTED[word]) {
    const start = offset + token.lastIndexOf(word);
    const orig = sc.text(start, start + word.length);
    if (orig !== WEEKDAY_ACCENTED[word]) return null;
  }
  return WORD_TO_WEEKDAY[word] ?? null;
}

function weekdaysInList(sc: Scanner, list: string, offset: number): Weekday[] | null {
  const re = new RegExp(WD_BARE, "g");
  const out: Weekday[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(list))) {
    const wd = weekdayFromToken(sc, m[0], offset + m.index);
    if (wd === null) return null;
    out.push(wd);
  }
  return out;
}

/** Ambiguous words are only accepted with the right accents (unless the user typed without accents). */
function accentIs(sc: Scanner, start: number, end: number, ...accepted: string[]): boolean {
  if (!sc.accented) return true;
  return accepted.includes(sc.text(start, end));
}

type Period = "sang" | "trua" | "chieu" | "toi" | "dem";

function applyPeriod(hour: number, period: Period | null): number {
  if (period === null) return hour;
  switch (period) {
    case "sang":
      return hour === 12 ? 0 : hour;
    case "trua":
      return hour >= 1 && hour <= 4 ? hour + 12 : hour;
    case "chieu":
    case "toi":
      return hour >= 1 && hour < 12 ? hour + 12 : hour;
    case "dem":
      if (hour === 12) return 0;
      return hour >= 7 && hour < 12 ? hour + 12 : hour;
  }
}

const TIME_SRC = "(\\d{1,2})(?:\\s*(?:h|g|gio)(?:\\s*(\\d{1,2})(?:\\s*(?:p|phut))?)?|:(\\d{2}))(\\s+ruoi)?";
const PERIOD_SRC = "(?:\\s+(sang|trua|chieu|toi|dem))?";

function buildTime(hour: string, min1?: string, min2?: string, ruoi?: string, period?: Period | null): TimeStr | null {
  let h = Number(hour);
  let m = Number(min1 ?? min2 ?? 0);
  if (ruoi && !min1 && !min2) m = 30;
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59) return null;
  if (h === 24) h = 0;
  h = applyPeriod(h, period ?? null);
  if (h > 23) return null;
  return minutesToTime(h * 60 + m);
}

function nearestDayMonth(day: number, month: number, today: DateStr): DateStr | null {
  const { y } = parseDate(today);
  const candidates = [y - 1, y, y + 1]
    .filter((yy) => month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(yy, month))
    .map((yy) => makeDate(yy, month, day));
  if (!candidates.length) return null;
  // Prefer upcoming dates; a date in the last 30 days is treated as recent past.
  const sorted = candidates
    .map((d) => ({ d, diff: diffDays(today, d) }))
    .filter((c) => c.diff >= -30)
    .sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  return sorted[0]?.d ?? null;
}

function upcomingWeekday(today: DateStr, wd: Weekday): DateStr {
  const diff = (wd - weekdayOf(today) + 7) % 7;
  return addDays(today, diff);
}

const CATEGORY_RULES: [CategoryHint, RegExp][] = [
  ["health", new RegExp(`${B}(gym|tap|chay|yoga|boi|the duc|the thao|da bong|cau long|thien|di bo|dap xe|ngu som|kham)${E}`)],
  ["study", new RegExp(`${B}(hoc|on thi|on tap|lam bai|bai tap|cfa|ielts|toeic|doc sach|nghien cuu|khoa hoc)${E}`)],
  ["work", new RegExp(`${B}(hop|bao cao|du an|cong viec|email|deadline|khach hang|thuyet trinh|lam viec|ke hoach)${E}`)],
  ["personal", new RegExp(`${B}(mua|don|nau|goi dien|gia dinh|ban be|du lich|sinh nhat|cafe|ca phe)${E}`)],
];

const CONNECTORS = new Set([
  "vào",
  "vao",
  "lúc",
  "luc",
  "từ",
  "tu",
  "đến",
  "den",
  "tới",
  "toi",
  "trong",
  "và",
  "va",
  "nhé",
  "nhe",
  "nha",
  "ở",
  "mỗi",
  "moi",
  "hằng",
  "hàng",
  "hang",
  "các",
  "cac",
  "ngày",
  "ngay",
  "bắt",
  "đầu",
  "khoảng",
  "khoang",
]);

function cleanTitle(raw: string): string {
  const words = raw
    .replace(/[\s]+/g, " ")
    .replace(/\s*([,;:])\s*/g, "$1 ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const isJunk = (w: string) => CONNECTORS.has(w.toLowerCase().replace(/[,.;:!?\-–~/]+$/g, "")) || /^[,.;:\-–~/]+$/.test(w);
  while (words.length && isJunk(words[words.length - 1]!)) words.pop();
  while (words.length && isJunk(words[0]!)) words.shift();
  const title = words
    .join(" ")
    .replace(/[\s,.;:\-–~/]+$/g, "")
    .replace(/^[\s,.;:\-–~/]+/g, "")
    .trim();
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : "";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function parseQuickAdd(input: string, today: DateStr): QuickAddDraft {
  const sc = new Scanner(input.slice(0, 300));
  const notes: string[] = [];
  let date: DateStr | null = null;
  let untilDate: DateStr | null = null;
  let startTime: TimeStr | null = null;
  let endTime: TimeStr | null = null;
  let duration: number | null = null;
  let recurrence: Recurrence = { type: "none" };
  let weeklyTarget: number | null = null;
  let priority: Priority = "medium";
  let periodHint: Period | null = null;

  // Weekly target: "5 lần/tuần", "5 lần mỗi tuần".
  const target = sc.take(`${B}(\\d{1,2})\\s*lan\\s*(?:\\/|mot|1|moi|trong)?\\s*(?:mot\\s*)?tuan${E}`);
  if (target) {
    const n = Number(target[1]);
    if (n >= 1 && n <= 7) weeklyTarget = n;
    else notes.push("Mục tiêu tuần phải từ 1 đến 7 lần.");
  }

  // Durations: "2 tiếng", "1 tiếng rưỡi", "30 phút", "trong 2 giờ".
  const dur =
    sc.take(`${B}(?:trong\\s*)?(\\d{1,2}(?:[.,]\\d)?)\\s*(tieng(?:\\s+dong\\s+ho)?|gio\\s+dong\\s+ho)(\\s+ruoi)?${E}`) ??
    sc.take(`${B}trong\\s*(\\d{1,2}(?:[.,]\\d)?)\\s*(gio|h)(\\s+ruoi)?${E}`);
  if (dur) {
    duration = Math.round(Number(dur[1]!.replace(",", ".")) * 60) + (dur[3] ? 30 : 0);
  }
  const mins = sc.take(`${B}(\\d{1,3})\\s*(phut|p)${E}`);
  if (mins) duration = (duration ?? 0) + Number(mins[1]);
  if (duration !== null && (duration <= 0 || duration > 24 * 60)) duration = null;

  // Monthly with a day: "ngày 15 hằng tháng".
  const monthlyDay = sc.take(`${B}(?:vao\\s*)?ngay\\s*(\\d{1,2})\\s*(?:hang|moi)\\s*thang${E}`);
  if (monthlyDay) {
    const day = Number(monthlyDay[1]);
    if (day >= 1 && day <= 31) {
      recurrence = { type: "monthly", interval: 1, monthly: { mode: "dayOfMonth", day } };
      const { y, m } = parseDate(today);
      const thisMonth = makeDate(y, m, Math.min(day, daysInMonth(y, m)));
      date = thisMonth >= today ? thisMonth : null;
      if (!date) {
        const nm = m === 12 ? 1 : m + 1;
        const ny = m === 12 ? y + 1 : y;
        date = makeDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
      }
    }
  }

  // Explicit dates: "25/11", "25/11/2026", "25 tháng 11".
  const dateSources = [
    `${B}(tu|bat dau tu|den|toi|cho den)?\\s*(?:ngay\\s*)?(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?${E}`,
    `${B}(tu|bat dau tu|den|toi|cho den)?\\s*(?:ngay\\s*)?(\\d{1,2})\\s*thang\\s*(\\d{1,2})(?:\\s*nam\\s*(\\d{4}))?${E}`,
  ];
  for (const src of dateSources) {
    for (let guard = 0; guard < 3; guard++) {
      const m = sc.take(src, (mm) => {
        const d = Number(mm[2]);
        const mo = Number(mm[3]);
        return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
      });
      if (!m) break;
      const d = Number(m[2]);
      const mo = Number(m[3]);
      let value: DateStr | null;
      if (m[4]) {
        const yy = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
        value = makeDate(yy, mo, d);
        if (!isValidDateStr(value)) value = null;
      } else {
        value = nearestDayMonth(d, mo, today);
      }
      if (!value) {
        notes.push("Có một ngày không hợp lệ nên đã bỏ qua.");
        continue;
      }
      const prefix = (m[1] ?? "").trim();
      if (prefix === "den" || prefix === "toi" || prefix === "cho den") untilDate = value;
      else if (!date) date = value;
    }
  }

  // Bare day of month: "ngày 25".
  if (!date) {
    const dom = sc.take(`${B}ngay\\s*(\\d{1,2})${E}`);
    if (dom) {
      const day = Number(dom[1]);
      const { y, m, d } = parseDate(today);
      if (day >= 1 && day <= 31) {
        if (day >= d && day <= daysInMonth(y, m)) date = makeDate(y, m, day);
        else {
          const nm = m === 12 ? 1 : m + 1;
          const ny = m === 12 ? y + 1 : y;
          date = makeDate(ny, nm, Math.min(day, daysInMonth(ny, nm)));
        }
      }
    }
  }

  // Period words attached to "nay"/"mai": "tối nay", "sáng mai".
  const periodDay = sc.take(`${B}(sang|trua|chieu|toi|dem)\\s+(nay|mai)${E}`, (m) =>
    accentIs(sc, m.index, m.index + m[1]!.length, "sáng", "trưa", "chiều", "tối", "đêm"),
  );
  if (periodDay) {
    periodHint = periodDay[1] as Period;
    if (!date) date = periodDay[2] === "mai" ? addDays(today, 1) : today;
  }

  // Time ranges: "19h-21h", "từ 19:00 đến 21:30", "7h tới 9h tối".
  const range = sc.take(
    `${B}(?:tu\\s*)?${TIME_SRC}${PERIOD_SRC}\\s*(?:den|toi|-|–|~)\\s*${TIME_SRC}${PERIOD_SRC}${E}`,
  );
  if (range) {
    const p2 = (range[10] as Period | undefined) ?? (range[5] as Period | undefined) ?? periodHint;
    const p1 = (range[5] as Period | undefined) ?? p2 ?? null;
    startTime = buildTime(range[1]!, range[2], range[3], range[4], p1);
    endTime = buildTime(range[6]!, range[7], range[8], range[9], p2 ?? null);
    if (startTime && endTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      // "9h - 11h tối" style: the period applies to both ends.
      const alt = buildTime(range[1]!, range[2], range[3], range[4], p2 ?? null);
      if (alt && timeToMinutes(alt) < timeToMinutes(endTime)) startTime = alt;
      else {
        notes.push("Giờ kết thúc phải sau giờ bắt đầu (không hỗ trợ qua nửa đêm).");
        endTime = null;
      }
    }
  } else {
    const single = sc.take(`${B}(?:(?:vao\\s*)?(?:luc|bat dau|tu)\\s*|vao\\s*)?${TIME_SRC}${PERIOD_SRC}${E}`, (m) => {
      if (!m[5]) return true;
      const start = m.index + m[0].length - m[5].length;
      return accentIs(sc, start, start + m[5].length, "sáng", "trưa", "chiều", "tối", "đêm");
    });
    if (single) {
      startTime = buildTime(single[1]!, single[2], single[3], single[4], (single[5] as Period | undefined) ?? periodHint);
    } else {
      const bare = sc.take(`${B}(?:vao\\s*)?luc\\s*(\\d{1,2})${PERIOD_SRC}${E}`);
      if (bare) startTime = buildTime(bare[1]!, undefined, undefined, undefined, (bare[2] as Period | undefined) ?? periodHint);
    }
  }
  if (startTime && endTime === null && duration) {
    const end = timeToMinutes(startTime) + duration;
    if (end < 24 * 60) endTime = minutesToTime(end);
    else notes.push("Thời lượng vượt quá nửa đêm nên chưa đặt giờ kết thúc.");
  }

  // Repetition.
  const daily = sc.take(`${B}(?:hang|moi)\\s*ngay${E}|${B}ngay\\s*nao\\s*cung${E}`);
  const everyN = daily ? null : sc.take(`${B}moi\\s*(\\d{1,2})\\s*(ngay|tuan|thang)${E}`);
  if (daily) recurrence = { type: "daily", interval: 1 };
  else if (everyN) {
    const n = Math.max(1, Number(everyN[1]));
    if (everyN[2] === "ngay") recurrence = { type: "daily", interval: n };
    else if (everyN[2] === "thang") {
      recurrence = { type: "monthly", interval: n, monthly: { mode: "dayOfMonth", day: parseDate(date ?? today).d } };
    } else recurrence = { type: "weekly", interval: n, weekdays: [] };
  }

  let weekdays: Weekday[] | null = null;
  const wdRange = sc.take(`${B}(?:tu\\s*)?(${WD_TOKEN})\\s*(?:den|toi|-|–)\\s*(${WD_TOKEN})${E}`, (m) => {
    const a = weekdayFromToken(sc, m[1]!, m.index + m[0].indexOf(m[1]!));
    const b = weekdayFromToken(sc, m[2]!, m.index + m[0].lastIndexOf(m[2]!));
    return a !== null && b !== null && a <= b;
  });
  if (wdRange) {
    const a = weekdayFromToken(sc, wdRange[1]!, wdRange.index + wdRange[0].indexOf(wdRange[1]!))!;
    const b = weekdayFromToken(sc, wdRange[2]!, wdRange.index + wdRange[0].lastIndexOf(wdRange[2]!))!;
    weekdays = Array.from({ length: b - a + 1 }, (_, i) => (a + i) as Weekday);
  } else {
    const list = sc.take(
      `${B}(?:(?:vao\\s*)?(?:moi|hang|cac)\\s*)?${WD_TOKEN}(?:\\s*(?:,|va|&|\\/)?\\s*${WD_BARE})+${E}`,
      (m) => (weekdaysInList(sc, m[0].replace(/^(?:vao\s*)?(?:moi|hang|cac)\s*/, (s) => " ".repeat(s.length)), m.index)?.length ?? 0) >= 2,
    );
    if (list) {
      weekdays = weekdaysInList(sc, list[0].replace(/^(?:vao\s*)?(?:moi|hang|cac)\s*/, (s) => " ".repeat(s.length)), list.index);
    } else {
      const every = sc.take(`${B}(?:vao\\s*)?(?:moi|hang|cac)\\s*(${WD_TOKEN})${E}`, (m) =>
        weekdayFromToken(sc, m[1]!, m.index + m[0].lastIndexOf(m[1]!)) !== null,
      );
      if (every) weekdays = [weekdayFromToken(sc, every[1]!, every.index + every[0].lastIndexOf(every[1]!))!];
    }
  }
  const weekdayGroups = sc.take(`${B}(?:cac\\s*)?(?:ngay\\s*trong\\s*tuan|ngay\\s*thuong)${E}`);
  if (!weekdays && weekdayGroups) weekdays = [1, 2, 3, 4, 5];
  const weekendEvery = !weekdays ? sc.take(`${B}(?:moi|hang|cac)\\s*cuoi\\s*tuan${E}`) : null;
  if (weekendEvery) weekdays = [6, 7];
  const weeklyWord = sc.take(`${B}(?:hang|moi)\\s*tuan${E}`);

  if (weekdays) {
    recurrence = {
      type: "weekly",
      interval: recurrence.type === "weekly" ? recurrence.interval : 1,
      weekdays: normalizeWeekdays(weekdays),
    };
  } else if (weeklyWord || (recurrence.type === "weekly" && recurrence.weekdays.length === 0)) {
    // Weekday resolved below once the date is known.
    recurrence = { type: "weekly", interval: recurrence.type === "weekly" ? recurrence.interval : 1, weekdays: [] };
  }
  const monthlyWord = recurrence.type === "none" ? sc.take(`${B}(?:hang|moi)\\s*thang${E}`) : null;

  // A single weekday is a date: "thứ 6", "thứ 6 tuần sau", "CN tuần này".
  if (!date) {
    const single = sc.take(`${B}(${WD_TOKEN})(?:\\s*(tuan\\s*(?:sau|toi|nay)))?${E}`, (m) =>
      weekdayFromToken(sc, m[1]!, m.index) !== null,
    );
    if (single) {
      const wd = weekdayFromToken(sc, single[1]!, single.index)!;
      const which = single[2]?.replace(/\s+/g, " ");
      if (which === "tuan nay") date = addDays(startOfWeek(today), wd - 1);
      else if (which === "tuan sau" || which === "tuan toi") date = addDays(startOfWeek(today), 7 + wd - 1);
      else date = upcomingWeekday(today, wd);
      if (recurrence.type === "weekly" && recurrence.weekdays.length === 0) {
        recurrence = { ...recurrence, weekdays: [wd] };
      }
    }
  }

  // Relative days.
  if (!date) {
    const rel =
      sc.take(`${B}(hom\\s*nay|hnay)${E}`) ??
      sc.take(`${B}(ngay\\s*mai)${E}`) ??
      sc.take(`${B}(ngay\\s*kia|ngay\\s*mot)${E}`, (m) =>
        m[1]!.includes("kia") ? true : accentIs(sc, m.index + m[0].length - 3, m.index + m[0].length, "mốt"),
      ) ??
      sc.take(`${B}(mai)${E}`, (m) => sc.original.slice(m.index, m.index + 3) !== "Mai" || m.index === 0) ??
      sc.take(`${B}(mot)${E}`, (m) => sc.accented && sc.text(m.index, m.index + 3) === "mốt") ??
      sc.take(`${B}(hom\\s*qua)${E}`) ??
      sc.take(`${B}(tuan\\s*(?:sau|toi))${E}`) ??
      sc.take(`${B}(cuoi\\s*tuan(?:\\s*nay)?)${E}`);
    if (rel) {
      const word = rel[1]!.replace(/\s+/g, " ");
      if (word === "hom nay" || word === "hnay") date = today;
      else if (word === "ngay mai" || word === "mai") date = addDays(today, 1);
      else if (word === "ngay kia" || word === "ngay mot" || word === "mot") date = addDays(today, 2);
      else if (word === "hom qua") date = addDays(today, -1);
      else if (word.startsWith("tuan")) date = addDays(startOfWeek(today), 7);
      else date = upcomingWeekday(today, 6);
    }
  }
  if (!periodHint) {
    // Lone period words ("buổi tối") are removed from the title.
    sc.take(`${B}(?:buoi\\s*)?(sang|trua|chieu|toi|dem)${E}`, (m) =>
      accentIs(sc, m.index + m[0].length - m[1]!.length, m.index + m[0].length, "sáng", "trưa", "chiều", "tối", "đêm"),
    );
  }

  // Priority.
  const urgent = sc.take(`${B}(?:rat\\s*)?(quan\\s*trong|gap|khan(?:\\s*cap)?|uu\\s*tien\\s*cao)${E}|!{2,}`, (m) => {
    // "gặp" (to meet) folds to the same letters as "gấp" (urgent).
    if (m[1] !== "gap") return true;
    const start = m.index + m[0].length - 3;
    return accentIs(sc, start, start + 3, "gấp");
  });
  if (urgent) priority = "high";
  else if (sc.take(`${B}(?:khong\\s*gap|uu\\s*tien\\s*thap)${E}`)) priority = "low";

  const finalDate = date ?? today;
  if (recurrence.type === "weekly" && recurrence.weekdays.length === 0) {
    recurrence = { ...recurrence, weekdays: [weekdayOf(finalDate)] };
  }
  if (monthlyWord && recurrence.type === "none") {
    recurrence = { type: "monthly", interval: 1, monthly: { mode: "dayOfMonth", day: parseDate(finalDate).d } };
  }
  if (weeklyTarget !== null && recurrence.type === "none") {
    // "5 lần/tuần" without days means every day with a target of 5.
    recurrence = { type: "daily", interval: 1 };
  }
  if (untilDate && (recurrence.type === "none" || untilDate < finalDate)) {
    if (recurrence.type === "none" && !date) {
      date = untilDate;
    }
    untilDate = recurrence.type === "none" ? null : untilDate < finalDate ? null : untilDate;
  }

  const categorySource = sc.folded.replace(/\s+/g, " ");
  let categoryHint: CategoryHint | null = null;
  const foldedOriginal = new Scanner(input).folded;
  for (const [hint, re] of CATEGORY_RULES) {
    if (re.test(categorySource) || re.test(foldedOriginal)) {
      categoryHint = hint;
      break;
    }
  }

  const title = cleanTitle(sc.remainder()) || cleanTitle(input);
  return {
    title,
    date: date ?? today,
    startTime,
    endTime,
    durationMinutes: duration,
    recurrence,
    untilDate,
    weeklyTarget,
    priority,
    categoryHint,
    notes,
  };
}
