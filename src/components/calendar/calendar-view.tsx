"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { QuickAdd } from "@/components/tasks/quick-add";
import { StatusLegend } from "@/components/tasks/status";
import { useTaskUI } from "@/components/tasks/task-ui";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { useEngine } from "@/lib/client/app-context";
import {
  type DateStr,
  addDays,
  addMonths,
  addYears,
  endOfWeek,
  isValidDateStr,
  isoWeek,
  monthGrid,
  parseDate,
  startOfMonth,
  startOfWeek,
} from "@/lib/domain/dates";
import { buildOccurrences } from "@/lib/domain/occurrences";
import type { Occurrence } from "@/lib/domain/types";
import { formatDate, monthLabel, weekLabel } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { DayView, MonthView, WeekView, YearView } from "./views";

export type CalendarMode = "day" | "week" | "month" | "year";
const MODES: CalendarMode[] = ["day", "week", "month", "year"];
const MODE_LABEL: Record<CalendarMode, string> = { day: "Ngày", week: "Tuần", month: "Tháng", year: "Năm" };

function shift(mode: CalendarMode, date: DateStr, dir: 1 | -1): DateStr {
  switch (mode) {
    case "day":
      return addDays(date, dir);
    case "week":
      return addDays(date, 7 * dir);
    case "month":
      return addMonths(date, dir);
    case "year":
      return addYears(date, dir);
  }
}

function filterByCategory(list: Occurrence[], cat: string) {
  if (cat === "all") return list;
  if (cat === "none") return list.filter((o) => !o.categoryId);
  return list.filter((o) => o.categoryId === cat);
}

export function CalendarView() {
  const { index, now, snapshot } = useEngine();
  const ui = useTaskUI();
  const params = useSearchParams();
  const pathname = usePathname();

  const [fallbackMode] = useState<CalendarMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? "day" : "week",
  );
  const modeParam = params.get("view") as CalendarMode | null;
  const mode: CalendarMode = modeParam && MODES.includes(modeParam) ? modeParam : fallbackMode;
  const dateParam = params.get("date");
  const date: DateStr = dateParam && isValidDateStr(dateParam) ? dateParam : now.today;
  const cat = params.get("cat") ?? "all";

  const navigate = useCallback(
    (next: { mode?: CalendarMode; date?: DateStr; cat?: string }) => {
      const sp = new URLSearchParams(params.toString());
      sp.set("view", next.mode ?? mode);
      sp.set("date", next.date ?? date);
      const c = next.cat ?? cat;
      if (c === "all") sp.delete("cat");
      else sp.set("cat", c);
      // Native history update: instant, no server round-trip.
      window.history.replaceState(null, "", `${pathname}?${sp.toString()}`);
    },
    [params, pathname, mode, date, cat],
  );

  const range = useMemo(() => {
    switch (mode) {
      case "day":
        return { start: date, end: date };
      case "week":
        return { start: startOfWeek(date), end: endOfWeek(date) };
      case "month": {
        const grid = monthGrid(date);
        return { start: grid[0]!, end: grid[41]! };
      }
      case "year":
        return { start: date, end: date };
    }
  }, [mode, date]);

  const occurrences = useMemo(
    () => (mode === "year" ? [] : filterByCategory(buildOccurrences(index, range.start, range.end), cat)),
    [index, range, cat, mode],
  );

  // Keyboard shortcuts: ← → to move, T = today, N = new task, D/W/M/Y = views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || document.querySelector("[role=dialog]"))) return;
      const key = e.key.toLowerCase();
      if (e.key === "ArrowLeft") navigate({ date: shift(mode, date, -1) });
      else if (e.key === "ArrowRight") navigate({ date: shift(mode, date, 1) });
      else if (key === "t") navigate({ date: now.today });
      else if (key === "n") {
        e.preventDefault();
        ui.openCreate({ startDate: mode === "day" ? date : now.today });
      } else if (key === "d") navigate({ mode: "day" });
      else if (key === "w") navigate({ mode: "week" });
      else if (key === "m") navigate({ mode: "month" });
      else if (key === "y") navigate({ mode: "year" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, mode, date, now.today, ui]);

  const title = (() => {
    switch (mode) {
      case "day":
        return formatDate(date, "long");
      case "week":
        return weekLabel(startOfWeek(date));
      case "month":
        return monthLabel(date);
      case "year":
        return `Năm ${parseDate(date).y}`;
    }
  })();

  const isCurrent =
    mode === "day"
      ? date === now.today
      : mode === "week"
        ? startOfWeek(date) === startOfWeek(now.today)
        : mode === "month"
          ? startOfMonth(date) === startOfMonth(now.today)
          : parseDate(date).y === parseDate(now.today).y;

  const usedNoCategory = snapshot.tasks.some((t) => t.versions.some((v) => !v.categoryId));

  return (
    <div>
      <PageHeader
        title="Lịch"
        subtitle={mode === "week" ? `Tuần ${isoWeek(date).week} · Thứ Hai → Chủ Nhật` : undefined}
        actions={
          <Button variant="primary" onClick={() => ui.openCreate({ startDate: mode === "day" ? date : now.today })} data-testid="add-task">
            <Plus /> Thêm công việc mới
          </Button>
        }
      />

      <div className="mb-4">
        <QuickAdd defaultDate={mode === "day" ? date : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => navigate({ date: shift(mode, date, -1) })} aria-label="Trước">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigate({ date: shift(mode, date, 1) })} aria-label="Sau">
            <ChevronRight />
          </Button>
          <Button variant={isCurrent ? "secondary" : "outline"} size="md" onClick={() => navigate({ date: now.today })}>
            Hôm nay
          </Button>
        </div>
        <h2
          className="order-first min-w-0 basis-full truncate px-1 text-[17px] font-semibold tracking-tight sm:order-none sm:flex-1 sm:basis-auto sm:text-[18px]"
          aria-live="polite"
          data-testid="calendar-title"
        >
          {title}
        </h2>
        <Segmented
          label="Chế độ xem"
          value={mode}
          onChange={(m) => navigate({ mode: m })}
          options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m], title: `Xem theo ${MODE_LABEL[m].toLowerCase()} (${m[0]!.toUpperCase()})` }))}
        />
      </div>

      {mode !== "year" && (snapshot.categories.length > 0 || usedNoCategory) && (
        <div className="scrollbar-thin -mx-4 mb-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Lọc theo danh mục">
          {[{ id: "all", name: "Tất cả", color: null as string | null }, ...snapshot.categories, ...(usedNoCategory ? [{ id: "none", name: "Không danh mục", color: null }] : [])].map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => navigate({ cat: c.id })}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ring-1 transition-colors",
                cat === c.id ? "bg-fg text-bg ring-fg" : "bg-surface text-fg-2 ring-line-strong hover:bg-surface-2",
              )}
            >
              {c.color && <span className="size-2 rounded-full" style={{ background: c.color }} />}
              {c.name}
            </button>
          ))}
          <StatusLegend className="ml-auto hidden shrink-0 pl-3 lg:flex" />
        </div>
      )}

      {mode === "day" && <DayView date={date} occurrences={occurrences} />}
      {mode === "week" && (
        <WeekView weekStart={startOfWeek(date)} occurrences={occurrences} onOpenDay={(d) => navigate({ mode: "day", date: d })} />
      )}
      {mode === "month" && (
        <MonthView
          month={startOfMonth(date)}
          occurrences={occurrences}
          selected={date}
          onSelect={(d) => navigate({ date: d })}
        />
      )}
      {mode === "year" && <YearView year={date} onOpenDay={(d) => navigate({ mode: "day", date: d })} />}
      <StatusLegend className="mt-6 lg:hidden" />
    </div>
  );
}
