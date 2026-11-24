"use client";

import { Flag, Repeat } from "lucide-react";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { displayStatus } from "@/lib/domain/occurrences";
import type { Occurrence } from "@/lib/domain/types";
import { formatTimeRange } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { StatusPill, TaskCheckbox } from "./status";
import { useTaskUI } from "./task-ui";

/** One occurrence with its tick box. `row` for checklists, `compact` for week/month cells. */
export function OccurrenceItem({ occ, variant = "row" }: { occ: Occurrence; variant?: "row" | "compact" }) {
  const { now, categoriesById } = useEngine();
  const actions = useAppActions();
  const ui = useTaskUI();
  const status = displayStatus(occ, now);
  const done = status === "completed";
  const muted = status === "cancelled" || status === "skipped";
  const category = occ.categoryId ? categoriesById.get(occ.categoryId) : null;
  const time = formatTimeRange(occ.startTime, occ.endTime);

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "group flex items-start gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-2",
          muted && "opacity-55",
        )}
        data-testid="occurrence"
        data-status={status}
      >
        <TaskCheckbox status={status} size="sm" label={occ.title} onToggle={() => actions.toggle(occ)} className="mt-px" />
        <button
          type="button"
          onClick={() => ui.openOccurrence(occ)}
          className="min-w-0 flex-1 text-left"
          aria-label={`Chi tiết: ${occ.title}`}
        >
          <span
            className={cn(
              "block truncate text-[12.5px] font-medium leading-tight text-fg",
              (done || muted) && "text-fg-3 line-through decoration-fg-3/50",
            )}
          >
            {occ.title}
          </span>
          {occ.startTime && <span className="block truncate text-[11px] leading-tight text-fg-3 tabular">{time}</span>}
        </button>
        <span className="mt-1 h-3 w-1 shrink-0 rounded-full" style={{ background: occ.color }} aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-2xl border border-line bg-surface px-3 py-3 shadow-soft transition-[background-color,box-shadow] hover:shadow-card sm:px-4",
        muted && "opacity-60",
      )}
      data-testid="occurrence"
      data-status={status}
    >
      <span className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: occ.color }} aria-hidden />
      <TaskCheckbox status={status} label={occ.title} onToggle={() => actions.toggle(occ)} className="mt-0.5" />
      <button type="button" onClick={() => ui.openOccurrence(occ)} className="min-w-0 flex-1 text-left" aria-label={`Chi tiết: ${occ.title}`}>
        <span
          className={cn(
            "block text-[15px] font-medium leading-snug text-fg transition-colors",
            (done || muted) && "text-fg-3 line-through decoration-fg-3/50",
          )}
        >
          {occ.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-fg-3">
          {time && <span className="tabular">{time}</span>}
          {category && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ background: category.color }} />
              {category.name}
            </span>
          )}
          {occ.recurring && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-3" aria-hidden />
              Lặp lại
            </span>
          )}
          {occ.priority === "high" && (
            <span className="inline-flex items-center gap-1">
              <Flag className="size-3 text-st-overdue" aria-hidden />
              Ưu tiên cao
            </span>
          )}
        </span>
      </button>
      {status !== "upcoming" && <StatusPill status={status} className="hidden shrink-0 sm:inline-flex" />}
    </div>
  );
}
