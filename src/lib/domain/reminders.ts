import type { NotificationPrefs } from "../settings";
import { type NowContext, addDays, startOfWeek, timeToMinutes, weekdayOf } from "./dates";
import { type EngineIndex, buildOccurrences, isCounted } from "./occurrences";
import { weekSummary } from "./stats";
import { formatDelta, formatPercent } from "./vi";

export interface Reminder {
  /** Unique per reminder, used to never send the same one twice. */
  key: string;
  kind: "beforeStart" | "unfinished" | "dailyReview" | "weeklySummary";
  title: string;
  body: string;
  url: string;
}

const DAY = 24 * 60;

/**
 * Reminders that became due in the window (now − windowMinutes, now].
 * Pure function: the browser (app open) and the server cron (Web Push)
 * use the same rules.
 */
export function dueReminders(
  index: EngineIndex,
  prefs: NotificationPrefs,
  now: NowContext,
  windowMinutes: number,
): Reminder[] {
  const out: Reminder[] = [];
  const isDue = (minuteOfToday: number) => minuteOfToday <= now.minutes && minuteOfToday > now.minutes - windowMinutes;
  const today = now.today;
  const todays = buildOccurrences(index, today, today).filter(isCounted);
  const open = todays.filter((o) => o.status !== "completed");

  if (prefs.beforeStart.enabled) {
    const lead = prefs.beforeStart.minutes;
    const tomorrow = buildOccurrences(index, addDays(today, 1), addDays(today, 1)).filter(isCounted);
    for (const [offset, list] of [
      [0, todays],
      [DAY, tomorrow],
    ] as const) {
      for (const o of list) {
        if (!o.startTime || o.status === "completed") continue;
        const at = offset + timeToMinutes(o.startTime) - lead;
        if (!isDue(at)) continue;
        out.push({
          key: `start:${o.key}:${o.startTime}:${lead}`,
          kind: "beforeStart",
          title: `Sắp đến giờ: ${o.title}`,
          body: `Bắt đầu lúc ${o.startTime}${o.endTime ? ` – ${o.endTime}` : ""} (còn ${lead} phút).`,
          url: `/calendar?view=day&date=${o.date}`,
        });
      }
    }
  }

  if (prefs.unfinished.enabled && isDue(timeToMinutes(prefs.unfinished.time)) && open.length > 0) {
    const names = open.slice(0, 3).map((o) => o.title).join(", ");
    out.push({
      key: `unfinished:${today}`,
      kind: "unfinished",
      title: `Còn ${open.length} việc chưa hoàn thành hôm nay`,
      body: open.length > 3 ? `${names} và ${open.length - 3} việc khác.` : `${names}.`,
      url: `/calendar?view=day&date=${today}`,
    });
  }

  if (prefs.dailyReview.enabled && isDue(timeToMinutes(prefs.dailyReview.time)) && todays.length > 0) {
    const done = todays.length - open.length;
    out.push({
      key: `review:${today}`,
      kind: "dailyReview",
      title: "Kiểm tra tiến độ cuối ngày",
      body: `Hôm nay bạn đã hoàn thành ${done}/${todays.length} việc (${formatPercent(done / todays.length)}).`,
      url: `/calendar?view=day&date=${today}`,
    });
  }

  if (prefs.weeklySummary.enabled && weekdayOf(today) === 7 && isDue(timeToMinutes(prefs.weeklySummary.time))) {
    const s = weekSummary(index, today, now);
    if (s.stats.scheduled > 0) {
      const cmp = s.comparison;
      out.push({
        key: `weekly:${startOfWeek(today)}`,
        kind: "weeklySummary",
        title: "Tổng kết tuần",
        body:
          `Hoàn thành ${s.stats.completed}/${s.stats.scheduled} việc (${formatPercent(s.stats.completionRate)}).` +
          (cmp?.rateDelta !== null && cmp?.rateDelta !== undefined ? ` So với tuần trước: ${formatDelta(cmp.rateDelta)}.` : ""),
        url: `/dashboard?week=${startOfWeek(today)}`,
      });
    }
  }

  return out;
}
