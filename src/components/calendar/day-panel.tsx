"use client";

import { Ban, CalendarPlus, Check, CircleAlert, Clock, Circle, SkipForward } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, ProgressBar } from "@/components/ui/misc";
import { OccurrenceItem } from "@/components/tasks/occurrence-item";
import { useTaskUI } from "@/components/tasks/task-ui";
import { useEngine } from "@/lib/client/app-context";
import type { DateStr } from "@/lib/domain/dates";
import { periodStats } from "@/lib/domain/stats";
import type { Occurrence } from "@/lib/domain/types";
import { formatDate, formatPercent } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";

/** Checklist of one day: untimed first, then by time; cancelled items at the bottom. */
export function DayChecklist({ date, occurrences, dense = false }: { date: DateStr; occurrences: Occurrence[]; dense?: boolean }) {
  const ui = useTaskUI();
  const [showCancelled, setShowCancelled] = useState(false);
  const active = occurrences.filter((o) => o.status !== "cancelled");
  const cancelled = occurrences.filter((o) => o.status === "cancelled");
  const untimed = active.filter((o) => !o.startTime);
  const timed = active.filter((o) => o.startTime);

  if (occurrences.length === 0) {
    return (
      <EmptyState
        icon={<CalendarPlus />}
        title="Chưa có công việc nào"
        description={`Thêm việc cho ${formatDate(date, "long")} bằng ô nhập nhanh hoặc nút bên dưới.`}
        action={
          <Button variant="primary" onClick={() => ui.openCreate({ startDate: date })}>
            + Thêm công việc
          </Button>
        }
        className={dense ? "py-6" : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {untimed.length > 0 && (
        <section aria-label="Không đặt giờ" className="flex flex-col gap-2">
          {timed.length > 0 && <h3 className="px-1 text-[12px] font-medium uppercase tracking-wide text-fg-3">Cả ngày</h3>}
          {untimed.map((o) => (
            <OccurrenceItem key={o.key} occ={o} />
          ))}
        </section>
      )}
      {timed.length > 0 && (
        <section aria-label="Theo giờ" className="flex flex-col gap-2">
          {untimed.length > 0 && <h3 className="px-1 text-[12px] font-medium uppercase tracking-wide text-fg-3">Theo giờ</h3>}
          {timed.map((o) => (
            <OccurrenceItem key={o.key} occ={o} />
          ))}
        </section>
      )}
      {cancelled.length > 0 && (
        <div>
          <button type="button" className="px-1 text-[12px] text-fg-3 hover:text-fg" onClick={() => setShowCancelled((v) => !v)}>
            {showCancelled ? "Ẩn" : "Hiện"} {cancelled.length} việc đã hủy
          </button>
          {showCancelled && (
            <div className="mt-2 flex flex-col gap-2">
              {cancelled.map((o) => (
                <OccurrenceItem key={o.key} occ={o} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DayProgressCard({ date, occurrences, className }: { date: DateStr; occurrences: Occurrence[]; className?: string }) {
  const { now } = useEngine();
  const ui = useTaskUI();
  const s = periodStats(occurrences, now);
  const rows = [
    { icon: Check, label: "Hoàn thành", value: s.completed, tone: "text-st-done" },
    { icon: Clock, label: "Đang thực hiện", value: s.inProgress, tone: "text-st-progress" },
    { icon: Circle, label: "Chưa thực hiện", value: s.upcoming, tone: "text-st-idle" },
    { icon: CircleAlert, label: "Quá hạn", value: s.overdue, tone: "text-st-overdue" },
  ];
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-4 shadow-soft", className)}>
      <p className="text-[13px] text-fg-3">{date === now.today ? "Tiến độ hôm nay" : `Tiến độ ${formatDate(date, "short")}`}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none tracking-tight sm:text-[34px]" data-testid="day-progress">
          {s.completed}/{s.scheduled}
        </span>
        <span className="text-[14px] text-fg-3">việc · {formatPercent(s.completionRate, "0%")}</span>
      </div>
      <ProgressBar value={s.completionRate} tone={s.scheduled > 0 && s.completed === s.scheduled ? "done" : "accent"} label="Tiến độ trong ngày" className="mt-3" />
      <ul className="mt-4 hidden grid-cols-2 gap-2 text-[13px] sm:grid">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-fg-2">
            <r.icon className={cn("size-4", r.tone)} aria-hidden />
            <span className="flex-1">{r.label}</span>
            <span className="font-semibold text-fg tabular">{r.value}</span>
          </li>
        ))}
        {(s.skipped > 0 || s.cancelled > 0) && (
          <li className="col-span-2 flex items-center gap-3 text-[12px] text-fg-3">
            {s.skipped > 0 && (
              <span className="inline-flex items-center gap-1">
                <SkipForward className="size-3.5" /> Bỏ qua {s.skipped}
              </span>
            )}
            {s.cancelled > 0 && (
              <span className="inline-flex items-center gap-1">
                <Ban className="size-3.5" /> Đã hủy {s.cancelled}
              </span>
            )}
          </li>
        )}
      </ul>
      <Button variant="outline" size="sm" className="mt-4 hidden w-full sm:inline-flex" onClick={() => ui.openCreate({ startDate: date })}>
        + Thêm việc vào ngày này
      </Button>
    </div>
  );
}
