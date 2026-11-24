import { type DateStr, type Weekday, daysInMonth, parseDate, weekdayOf } from "@/lib/domain/dates";
import type { MonthlyRule, Recurrence } from "@/lib/domain/types";

export type RepeatPreset = "none" | "daily" | "specific" | "weekly" | "monthly" | "custom";
export type CustomUnit = "day" | "week" | "month";

export interface RepeatState {
  preset: RepeatPreset;
  weekdays: Weekday[];
  interval: number;
  unit: CustomUnit;
  monthlyMode: "dayOfMonth" | "nthWeekday";
}

export const PRESET_LABEL: Record<RepeatPreset, string> = {
  none: "Không lặp lại",
  daily: "Hằng ngày",
  specific: "Các ngày cụ thể trong tuần",
  weekly: "Hằng tuần",
  monthly: "Hằng tháng",
  custom: "Tùy chỉnh chu kỳ",
};

export function monthlyRuleFor(startDate: DateStr, mode: "dayOfMonth" | "nthWeekday"): MonthlyRule {
  const { y, m, d } = parseDate(startDate);
  if (mode === "dayOfMonth") return { mode, day: d };
  const isLast = d + 7 > daysInMonth(y, m);
  const nth = Math.ceil(d / 7);
  return { mode, nth: isLast && nth >= 4 ? -1 : (Math.min(nth, 4) as 1 | 2 | 3 | 4), weekday: weekdayOf(startDate) };
}

export function toRecurrence(s: RepeatState, startDate: DateStr): Recurrence {
  const weekdays = s.weekdays.length ? s.weekdays : [weekdayOf(startDate)];
  switch (s.preset) {
    case "none":
      return { type: "none" };
    case "daily":
      return { type: "daily", interval: 1 };
    case "specific":
      return { type: "weekly", interval: 1, weekdays };
    case "weekly":
      return { type: "weekly", interval: 1, weekdays: [weekdayOf(startDate)] };
    case "monthly":
      return { type: "monthly", interval: 1, monthly: monthlyRuleFor(startDate, s.monthlyMode) };
    case "custom": {
      const interval = Math.max(1, Math.min(99, Math.round(s.interval) || 1));
      if (s.unit === "day") return { type: "daily", interval };
      if (s.unit === "week") return { type: "weekly", interval, weekdays };
      return { type: "monthly", interval, monthly: monthlyRuleFor(startDate, s.monthlyMode) };
    }
  }
}

export function fromRecurrence(rule: Recurrence, startDate: DateStr): RepeatState {
  const base: RepeatState = { preset: "none", weekdays: [weekdayOf(startDate)], interval: 2, unit: "week", monthlyMode: "dayOfMonth" };
  switch (rule.type) {
    case "none":
      return base;
    case "daily":
      return rule.interval === 1 ? { ...base, preset: "daily" } : { ...base, preset: "custom", unit: "day", interval: rule.interval };
    case "weekly": {
      const days = [...rule.weekdays].sort((a, b) => a - b);
      if (rule.interval !== 1) return { ...base, preset: "custom", unit: "week", interval: rule.interval, weekdays: days };
      if (days.length === 7) return { ...base, preset: "specific", weekdays: days };
      if (days.length === 1 && days[0] === weekdayOf(startDate)) return { ...base, preset: "weekly", weekdays: days };
      return { ...base, preset: "specific", weekdays: days };
    }
    case "monthly":
      return rule.interval === 1
        ? { ...base, preset: "monthly", monthlyMode: rule.monthly.mode }
        : { ...base, preset: "custom", unit: "month", interval: rule.interval, monthlyMode: rule.monthly.mode };
  }
}
