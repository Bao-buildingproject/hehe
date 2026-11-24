"use client";

import { Ban, Check, CircleAlert, Clock, SkipForward } from "lucide-react";
import { motion } from "motion/react";
import type { DisplayStatus } from "@/lib/domain/types";
import { STATUS_LABEL } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";

const RING: Record<DisplayStatus, string> = {
  completed: "border-st-done bg-st-done text-white",
  in_progress: "border-st-progress bg-st-progress-soft text-st-progress",
  overdue: "border-st-overdue bg-st-overdue-soft text-st-overdue",
  upcoming: "border-st-idle/70 bg-transparent text-transparent hover:border-st-done hover:text-st-done/60",
  skipped: "border-st-idle/50 bg-surface-2 text-fg-3",
  cancelled: "border-st-idle/40 bg-surface-2 text-fg-3",
};

/** The tick box. Click toggles completed ⇄ not completed. */
export function TaskCheckbox({
  status,
  onToggle,
  label,
  size = "md",
  className,
}: {
  status: DisplayStatus;
  onToggle: () => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const done = status === "completed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? "Bỏ đánh dấu" : "Đánh dấu hoàn thành"}: ${label}`}
      title={STATUS_LABEL[status]}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full border-2 transition-colors duration-150 active:scale-90",
        size === "sm" ? "size-[18px]" : "size-[22px]",
        RING[status],
        className,
      )}
    >
      {done ? (
        <motion.span
          key="done"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 24 }}
          className="grid place-items-center"
        >
          <Check className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={3.5} />
        </motion.span>
      ) : status === "upcoming" ? (
        <Check className={size === "sm" ? "size-3" : "size-3.5"} strokeWidth={3} />
      ) : status === "in_progress" ? (
        <span className={cn("rounded-full bg-st-progress", size === "sm" ? "size-1.5" : "size-2")} />
      ) : status === "overdue" ? (
        <span className={cn("rounded-full bg-st-overdue", size === "sm" ? "size-1.5" : "size-2")} />
      ) : status === "skipped" ? (
        <SkipForward className="size-3" strokeWidth={2.5} />
      ) : (
        <Ban className="size-3" strokeWidth={2.5} />
      )}
    </button>
  );
}

const PILL_ICON: Partial<Record<DisplayStatus, typeof Check>> = {
  completed: Check,
  in_progress: Clock,
  overdue: CircleAlert,
  skipped: SkipForward,
  cancelled: Ban,
};

const PILL_TONE: Record<DisplayStatus, string> = {
  completed: "bg-st-done-soft [&_svg]:text-st-done",
  in_progress: "bg-st-progress-soft [&_svg]:text-st-progress",
  overdue: "bg-st-overdue-soft [&_svg]:text-st-overdue",
  upcoming: "bg-surface-2",
  skipped: "bg-surface-2",
  cancelled: "bg-surface-2",
};

/** Status label: colored icon + text in ink colors (never color alone). */
export function StatusPill({ status, className }: { status: DisplayStatus; className?: string }) {
  const Icon = PILL_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-fg-2",
        PILL_TONE[status],
        className,
      )}
    >
      {Icon ? <Icon className="size-3" strokeWidth={2.5} /> : <span className="size-1.5 rounded-full bg-st-idle" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusLegend({ className }: { className?: string }) {
  const items: { status: DisplayStatus; dot: string }[] = [
    { status: "completed", dot: "bg-st-done" },
    { status: "in_progress", dot: "bg-st-progress" },
    { status: "upcoming", dot: "bg-st-idle" },
    { status: "overdue", dot: "bg-st-overdue" },
  ];
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3", className)} aria-label="Chú thích màu trạng thái">
      {items.map((i) => (
        <li key={i.status} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", i.dot)} />
          {STATUS_LABEL[i.status]}
        </li>
      ))}
    </ul>
  );
}

export const STATUS_DOT: Record<DisplayStatus, string> = {
  completed: "bg-st-done",
  in_progress: "bg-st-progress",
  overdue: "bg-st-overdue",
  upcoming: "bg-st-idle",
  skipped: "bg-st-idle/50",
  cancelled: "bg-st-idle/30",
};
