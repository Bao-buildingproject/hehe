"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { OccurrenceItem } from "@/components/tasks/occurrence-item";
import { STATUS_DOT } from "@/components/tasks/status";
import { useTaskUI } from "@/components/tasks/task-ui";
import { ProgressBar } from "@/components/ui/misc";
import { useEngine } from "@/lib/client/app-context";
import {
  type DateStr,
  type Weekday,
  addDays,
  eachDay,
  endOfYear,
  makeDate,
  monthGrid,
  parseDate,
  startOfMonth,
  startOfYear,
  weekdayOf,
} from "@/lib/domain/dates";
import { displayStatus, groupByDate } from "@/lib/domain/occurrences";
import { type HeatCell, heatmap } from "@/lib/domain/stats";
import type { Occurrence } from "@/lib/domain/types";
import { WEEKDAY_LONG, WEEKDAY_SHORT, formatDate, formatPercent } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { DayChecklist, DayProgressCard } from "./day-panel";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function counted(list: Occurrence[]) {
  return list.filter((o) => o.status !== "cancelled" && o.status !== "skipped");
}

export function DayView({ date, occurrences }: { date: DateStr; occurrences: Occurrence[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <DayChecklist date={date} occurrences={occurrences} />
      </div>
      <DayProgressCard date={date} occurrences={occurrences} className="order-first lg:order-none lg:sticky lg:top-6 lg:self-start" />
    </div>
  );
}

function DayHeader({ date, list, onOpenDay }: { date: DateStr; list: Occurrence[]; onOpenDay: (d: DateStr) => void }) {
  const { now } = useEngine();
  const c = counted(list);
  const done = c.filter((o) => o.status === "completed").length;
  const isToday = date === now.today;
  return (
    <button type="button" onClick={() => onOpenDay(date)} className="group w-full rounded-xl px-2 py-2 text-left hover:bg-surface-2" aria-label={`Xem ${formatDate(date, "long")}`}>
      <div className="flex items-center gap-2">
        <span className={cn("text-[12px] font-medium uppercase", isToday ? "text-accent" : "text-fg-3")}>{WEEKDAY_SHORT[weekdayOf(date)]}</span>
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-[15px] font-semibold tabular",
            isToday ? "bg-accent text-accent-fg" : "text-fg",
          )}
        >
          {parseDate(date).d}
        </span>
        {c.length > 0 && <span className="ml-auto text-[11px] text-fg-3 tabular">{done}/{c.length}</span>}
      </div>
      {c.length > 0 && <ProgressBar value={done / c.length} size="sm" tone={done === c.length ? "done" : "accent"} label={`Tiến độ ${formatDate(date)}`} className="mt-2" />}
    </button>
  );
}

export function WeekView({ weekStart, occurrences, onOpenDay }: { weekStart: DateStr; occurrences: Occurrence[]; onOpenDay: (d: DateStr) => void }) {
  const ui = useTaskUI();
  const { now } = useEngine();
  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);
  const days = eachDay(weekStart, addDays(weekStart, 6));
  return (
    <>
      {/* Tablet & desktop: seven columns */}
      <div className="hidden grid-cols-7 gap-2 md:grid" data-testid="week-grid">
        {days.map((d) => {
          const list = (byDate.get(d) ?? []).filter((o) => o.status !== "cancelled");
          return (
            <div
              key={d}
              className={cn(
                "group/col flex min-h-[360px] min-w-0 flex-col rounded-2xl border bg-surface p-1.5 shadow-soft",
                d === now.today ? "border-accent/40 ring-2 ring-accent/10" : "border-line",
              )}
              data-date={d}
            >
              <DayHeader date={d} list={list} onOpenDay={onOpenDay} />
              <div className="mt-1 flex flex-1 flex-col gap-0.5">
                {list.map((o) => (
                  <OccurrenceItem key={o.key} occ={o} variant="compact" />
                ))}
              </div>
              <button
                type="button"
                onClick={() => ui.openCreate({ startDate: d })}
                className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[12px] text-fg-3 opacity-0 transition-opacity hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 group-hover/col:opacity-100"
                aria-label={`Thêm công việc ${formatDate(d, "long")}`}
              >
                <Plus className="size-3.5" /> Thêm
              </button>
            </div>
          );
        })}
      </div>

      {/* Phones: one section per day */}
      <div className="flex flex-col gap-5 md:hidden">
        {days.map((d) => {
          const list = byDate.get(d) ?? [];
          const c = counted(list);
          const done = c.filter((o) => o.status === "completed").length;
          return (
            <section key={d} aria-label={formatDate(d, "long")}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <button type="button" onClick={() => onOpenDay(d)} className={cn("text-[15px] font-semibold", d === now.today ? "text-accent" : "text-fg")}>
                  {WEEKDAY_LONG[weekdayOf(d)]} {formatDate(d, "dayMonth")}
                  {d === now.today && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium">Hôm nay</span>}
                </button>
                {c.length > 0 && <span className="text-[12px] text-fg-3 tabular">{done}/{c.length}</span>}
                <button type="button" onClick={() => ui.openCreate({ startDate: d })} className="ml-auto rounded-lg p-1.5 text-fg-3 hover:bg-surface-2" aria-label={`Thêm công việc ${formatDate(d, "long")}`}>
                  <Plus className="size-4" />
                </button>
              </div>
              {list.filter((o) => o.status !== "cancelled").length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-fg-3">Không có công việc</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {list
                    .filter((o) => o.status !== "cancelled")
                    .map((o) => (
                      <OccurrenceItem key={o.key} occ={o} />
                    ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function MonthView({
  month,
  occurrences,
  selected,
  onSelect,
}: {
  month: DateStr;
  occurrences: Occurrence[];
  selected: DateStr;
  onSelect: (d: DateStr) => void;
}) {
  const { now } = useEngine();
  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);
  const grid = monthGrid(month);
  const { m } = parseDate(month);
  const selectedList = byDate.get(selected) ?? [];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/50">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-fg-3">
              {WEEKDAY_SHORT[w]}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Lịch tháng">
          {grid.map((d, i) => {
            const list = (byDate.get(d) ?? []).filter((o) => o.status !== "cancelled");
            const c = counted(list);
            const done = c.filter((o) => o.status === "completed").length;
            const inMonth = parseDate(d).m === m;
            const isToday = d === now.today;
            const isSelected = d === selected;
            return (
              <button
                key={d}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${formatDate(d, "long")}: ${c.length} việc, ${done} hoàn thành`}
                onClick={() => onSelect(d)}
                className={cn(
                  "relative flex min-h-[64px] flex-col items-stretch gap-1 border-line p-1 text-left transition-colors sm:min-h-[104px] sm:p-1.5",
                  i % 7 !== 6 && "border-r",
                  i < 35 && "border-b",
                  inMonth ? "bg-surface hover:bg-surface-2" : "bg-surface-2/40 text-fg-3 hover:bg-surface-2",
                  isSelected && "bg-accent-soft/60 hover:bg-accent-soft/80",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center self-center rounded-full text-[12px] font-semibold tabular sm:self-start sm:text-[13px]",
                    isToday && "bg-accent text-accent-fg",
                    !isToday && !inMonth && "text-fg-3",
                  )}
                >
                  {parseDate(d).d}
                </span>
                {/* Desktop: task chips */}
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 3).map((o) => (
                    <span key={o.key} className="flex items-center gap-1 truncate rounded-md px-1 py-px text-[11px] leading-tight text-fg-2">
                      <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[displayStatus(o, now)])} />
                      <span className={cn("truncate", o.status === "completed" && "text-fg-3 line-through")}>{o.title}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[11px] text-fg-3">+{list.length - 3} việc khác</span>}
                </span>
                {/* Phones: status dots */}
                <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {list.slice(0, 4).map((o) => (
                    <span key={o.key} className={cn("size-1.5 rounded-full", STATUS_DOT[displayStatus(o, now)])} />
                  ))}
                </span>
                {c.length > 0 && (
                  <span className="mt-auto hidden h-1 overflow-hidden rounded-full bg-track sm:block" aria-hidden>
                    <span className={cn("block h-full rounded-full", done === c.length ? "bg-st-done" : "bg-accent")} style={{ width: `${(done / c.length) * 100}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-[15px] font-semibold">{formatDate(selected, "long")}</h3>
        </div>
        <DayProgressCard date={selected} occurrences={selectedList} />
        <DayChecklist date={selected} occurrences={selectedList} dense />
      </div>
    </div>
  );
}

export const HEAT_CLASS: Record<HeatCell["level"], string> = {
  [-1]: "bg-[var(--heat-none)]",
  0: "bg-[var(--heat-0)]",
  1: "bg-[var(--heat-1)]",
  2: "bg-[var(--heat-2)]",
  3: "bg-[var(--heat-3)]",
  4: "bg-[var(--heat-4)]",
};

export const HEAT_INK: Record<HeatCell["level"], string> = {
  [-1]: "text-fg-3",
  0: "text-fg-3",
  1: "text-[var(--heat-ink-1)]",
  2: "text-[var(--heat-ink-2)]",
  3: "text-[var(--heat-ink-3)]",
  4: "text-[var(--heat-ink-4)]",
};

export function HeatLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3", className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-3 rounded-[3px] ring-1 ring-line", HEAT_CLASS[-1])} /> Không có lịch
      </span>
      <span className="inline-flex items-center gap-1">
        0%
        {([0, 1, 2, 3, 4] as const).map((l) => (
          <span key={l} className={cn("size-3 rounded-[3px]", HEAT_CLASS[l])} />
        ))}
        100%
      </span>
    </div>
  );
}

export function YearView({ year, onOpenDay }: { year: DateStr; onOpenDay: (d: DateStr) => void }) {
  const { index, now } = useEngine();
  const start = startOfYear(year);
  const end = endOfYear(year);
  const cells = useMemo(() => heatmap(index, start, end, now), [index, start, end, now]);
  const byDate = useMemo(() => new Map(cells.map((c) => [c.date, c])), [cells]);
  const { y } = parseDate(year);
  const total = cells.reduce((a, c) => ({ s: a.s + c.scheduled, d: a.d + c.completed }), { s: 0, d: 0 });
  const months = Array.from({ length: 12 }, (_, i) => makeDate(y, i + 1, 1));
  const monthStats = months.map((mStart) => {
    let s = 0;
    let d = 0;
    for (const c of cells) {
      if (c.date.slice(0, 7) === mStart.slice(0, 7)) {
        s += c.scheduled;
        d += c.completed;
      }
    }
    return { s, d };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] shadow-soft">
        <span>
          Cả năm: <b className="tabular">{total.d}</b>/<span className="tabular">{total.s}</span> việc hoàn thành ({formatPercent(total.s ? total.d / total.s : null)})
        </span>
        <HeatLegend className="ml-auto" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((mStart, mi) => {
          const grid = monthGrid(mStart);
          const st = monthStats[mi]!;
          return (
            <div key={mStart} className="rounded-2xl border border-line bg-surface p-3 shadow-soft">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-[14px] font-semibold">Tháng {mi + 1}</h3>
                <span className="text-[12px] text-fg-3 tabular">{st.s ? `${st.d}/${st.s} · ${formatPercent(st.d / st.s)}` : "—"}</span>
              </div>
              <div className="mx-auto grid max-w-[264px] grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-center text-[10px] font-medium text-fg-3">
                    {WEEKDAY_SHORT[w]}
                  </span>
                ))}
                {grid.map((d) => {
                  const inMonth = d.slice(0, 7) === mStart.slice(0, 7);
                  if (!inMonth) return <span key={d} className="aspect-square" aria-hidden />;
                  const c = byDate.get(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onOpenDay(d)}
                      title={`${formatDate(d, "long")}: ${c && c.scheduled ? `${c.completed}/${c.scheduled} hoàn thành` : "không có lịch"}`}
                      aria-label={`${formatDate(d, "long")}: ${c && c.scheduled ? `${c.completed}/${c.scheduled} hoàn thành` : "không có lịch"}`}
                      className={cn(
                        "aspect-square rounded-[4px] text-[9px] font-medium tabular transition-transform hover:scale-110",
                        HEAT_CLASS[c?.level ?? -1],
                        HEAT_INK[c?.level ?? -1],
                        d === now.today && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                      )}
                    >
                      {parseDate(d).d}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[12px] text-fg-3">Màu thể hiện tỷ lệ hoàn thành trong ngày. Nhấn vào một ngày để xem danh sách công việc.</p>
    </div>
  );
}

export function monthOf(date: DateStr) {
  return startOfMonth(date);
}
