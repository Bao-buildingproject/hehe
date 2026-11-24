"use client";

import { Ban, Check, ChevronLeft, ChevronRight, Flame, Info, ListChecks, Pause, Plus, SkipForward, Trophy, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { useTaskUI } from "@/components/tasks/task-ui";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, ProgressBar } from "@/components/ui/misc";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { type DateStr, type Weekday, addDays, isValidDateStr, parseDate, startOfWeek, weekdayOf } from "@/lib/domain/dates";
import { type HabitCell, type HabitWeekRow, weekSummary } from "@/lib/domain/stats";
import { computeStreak } from "@/lib/domain/streaks";
import { STATUS_LABEL, WEEKDAY_LONG, WEEKDAY_SHORT, formatDate, formatPercent, streakUnit, weekLabel } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";

function useWeekParam(today: DateStr) {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("week");
  const weekStart = startOfWeek(raw && isValidDateStr(raw) ? raw : today);
  const setWeek = (d: DateStr) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", startOfWeek(d));
    window.history.replaceState(null, "", `${pathname}?${sp.toString()}`);
  };
  return { weekStart, setWeek };
}

export function WeekNav({ weekStart, today, onChange }: { weekStart: DateStr; today: DateStr; onChange: (d: DateStr) => void }) {
  const current = weekStart === startOfWeek(today);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" onClick={() => onChange(addDays(weekStart, -7))} aria-label="Tuần trước">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon" onClick={() => onChange(addDays(weekStart, 7))} aria-label="Tuần sau">
          <ChevronRight />
        </Button>
        <Button variant={current ? "secondary" : "outline"} onClick={() => onChange(today)}>
          Tuần này
        </Button>
      </div>
      <h2 className="px-1 text-[16px] font-semibold tracking-tight sm:text-[18px]" aria-live="polite" data-testid="week-title">
        {weekLabel(weekStart)}
      </h2>
    </div>
  );
}

function cellLabel(row: HabitWeekRow, cell: HabitCell) {
  const day = `${WEEKDAY_LONG[weekdayOf(cell.date)]} ${formatDate(cell.date, "dayMonth")}`;
  if (cell.state === "none") return `${row.title}, ${day}: không có lịch`;
  return `${row.title}, ${day}: ${STATUS_LABEL[cell.state]}`;
}

function HabitCellButton({ row, cell, isToday }: { row: HabitWeekRow; cell: HabitCell; isToday: boolean }) {
  const actions = useAppActions();
  if (cell.state === "none") {
    return (
      <span className="grid size-9 place-items-center text-[15px] text-fg-3/70" aria-label={cellLabel(row, cell)} title="Không có lịch — không tính là bỏ lỡ">
        —
      </span>
    );
  }
  const toggle = () => {
    const open = cell.occurrences.find((o) => o.status !== "completed");
    if (open) actions.setStatus(open, "completed");
    else {
      const last = cell.occurrences.at(-1);
      if (last) actions.setStatus(last, "pending");
    }
  };
  const done = cell.state === "completed";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={done}
      aria-label={cellLabel(row, cell)}
      title={STATUS_LABEL[cell.state]}
      data-testid="habit-cell"
      data-state={cell.state}
      className={cn(
        "grid size-9 place-items-center rounded-xl transition-all active:scale-90",
        done && "bg-st-done text-white shadow-soft",
        cell.state === "overdue" && "bg-st-overdue-soft text-st-overdue hover:bg-st-done-soft hover:text-st-done",
        cell.state === "in_progress" && "bg-st-progress-soft text-st-progress ring-2 ring-st-progress/70 ring-inset",
        cell.state === "upcoming" && "bg-surface-2 text-transparent ring-1 ring-inset ring-line-strong hover:text-st-done/60",
        (cell.state === "skipped" || cell.state === "cancelled") && "bg-surface-2 text-fg-3",
        isToday && !done && "ring-2 ring-inset ring-accent/60",
      )}
    >
      {done ? (
        <Check className="size-4" strokeWidth={3} />
      ) : cell.state === "overdue" ? (
        <X className="size-4" strokeWidth={3} />
      ) : cell.state === "skipped" ? (
        <SkipForward className="size-3.5" />
      ) : cell.state === "cancelled" ? (
        <Ban className="size-3.5" />
      ) : cell.state === "in_progress" ? (
        <span className="size-2 rounded-full bg-st-progress" />
      ) : (
        <Check className="size-4" strokeWidth={3} />
      )}
    </button>
  );
}

function TargetCell({ row }: { row: HabitWeekRow }) {
  if (row.target <= 0) return <span className="text-[12px] text-fg-3">—</span>;
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="font-semibold text-fg tabular" data-testid="habit-target">
          {Math.min(row.completed, row.target)}/{row.target}
        </span>
        {row.targetMet ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-st-done-soft px-1.5 py-0.5 text-[11px] font-medium text-fg-2">
            <Trophy className="size-3 text-st-done" /> Đạt
          </span>
        ) : (
          <span className="text-fg-3">{formatPercent(row.progress)}</span>
        )}
      </div>
      <ProgressBar value={row.progress} size="sm" tone={row.targetMet ? "done" : "accent"} label={`Tiến độ mục tiêu ${row.title}`} />
    </div>
  );
}

export function HabitsView() {
  const { index, now } = useEngine();
  const ui = useTaskUI();
  const { weekStart, setWeek } = useWeekParam(now.today);
  const summary = useMemo(() => weekSummary(index, weekStart, now), [index, weekStart, now]);
  const rows = summary.habits;
  const streaks = useMemo(
    () => new Map(rows.map((r) => [r.taskId, computeStreak(index, index.taskById.get(r.taskId)!, now)])),
    [rows, index, now],
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const habitScheduled = rows.reduce((a, r) => a + r.scheduled, 0);
  const habitCompleted = rows.reduce((a, r) => a + r.completed, 0);
  const goal = summary.goal;

  return (
    <div>
      <PageHeader
        title="Theo dõi thói quen"
        subtitle="Tích trực tiếp vào từng ô. Tuần tính từ Thứ Hai đến Chủ Nhật."
        actions={
          <Button variant="primary" onClick={() => ui.openCreate({ recurrence: { type: "daily", interval: 1 } })}>
            <Plus /> Thêm thói quen
          </Button>
        }
      />
      <div className="mb-4">
        <WeekNav weekStart={weekStart} today={now.today} onChange={setWeek} />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks />}
            title="Chưa có thói quen nào trong tuần này"
            description="Thói quen là các công việc lặp lại (hằng ngày, các ngày trong tuần…). Tạo một thói quen và đặt mục tiêu số lần mỗi tuần."
            action={
              <Button variant="primary" onClick={() => ui.openCreate({ recurrence: { type: "daily", interval: 1 } })}>
                <Plus /> Tạo thói quen đầu tiên
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-3 sm:p-4">
              <p className="text-[13px] text-fg-3">Tổng số lần hoàn thành</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]" data-testid="goal-completions">
                {goal.totalCompletions}
              </p>
              <p className="mt-1.5 text-[12px] text-fg-3">{habitScheduled} lần đã lên lịch</p>
            </Card>
            <Card className="p-3 sm:p-4">
              <p className="text-[13px] text-fg-3">Tổng mục tiêu</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]" data-testid="goal-target">
                {goal.totalTarget}
              </p>
              <p className="mt-1.5 text-[12px] text-fg-3">
                {goal.habitsMet}/{goal.habitsWithTarget} thói quen đã đạt
              </p>
            </Card>
            <Card className="p-3 sm:p-4">
              <p className="text-[13px] text-fg-3">Tỷ lệ đạt mục tiêu tuần</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]" data-testid="goal-rate">
                {formatPercent(goal.rate)}
              </p>
              <ProgressBar value={goal.rate} className="mt-2.5" label="Tỷ lệ đạt mục tiêu tuần" tone={goal.rate === 1 ? "done" : "accent"} />
            </Card>
            <Card className="p-3 sm:p-4">
              <p className="text-[13px] text-fg-3">Tỷ lệ hoàn thành lịch</p>
              <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]">
                {formatPercent(habitScheduled ? habitCompleted / habitScheduled : null)}
              </p>
              <p className="mt-1.5 text-[12px] text-fg-3">
                {habitCompleted}/{habitScheduled} lần (cả tuần)
              </p>
            </Card>
          </div>

          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full border-collapse text-[14px]" data-testid="habit-table">
                <thead>
                  <tr className="border-b border-line bg-surface-2/50 text-left text-[12px] text-fg-3">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Thói quen
                    </th>
                    {days.map((d) => (
                      <th key={d} scope="col" className="px-1 py-2.5 text-center font-medium">
                        <span className={cn("block", d === now.today && "text-accent")}>{WEEKDAY_SHORT[weekdayOf(d) as Weekday]}</span>
                        <span className={cn("block text-[11px] tabular", d === now.today ? "font-semibold text-accent" : "text-fg-3")}>
                          {parseDate(d).d}
                        </span>
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-center font-medium">
                      Tổng
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Mục tiêu tuần
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      Chuỗi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = streaks.get(r.taskId);
                    return (
                      <tr key={r.taskId} className="border-b border-line last:border-0 hover:bg-surface-2/40" data-testid="habit-row" data-title={r.title}>
                        <th scope="row" className="max-w-[240px] px-4 py-2 text-left font-medium">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left hover:underline"
                            onClick={() => {
                              const t = index.taskById.get(r.taskId);
                              if (t) ui.editTask(t);
                            }}
                          >
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                            <span className="truncate">{r.title}</span>
                            {r.paused && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-normal text-fg-3">
                                <Pause className="size-3" /> Tạm dừng
                              </span>
                            )}
                          </button>
                        </th>
                        {r.cells.map((c) => (
                          <td key={c.date} className="px-1 py-2 text-center">
                            <div className="flex justify-center">
                              <HabitCellButton row={r} cell={c} isToday={c.date === now.today} />
                            </div>
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center font-semibold tabular" data-testid="habit-total">
                          {r.completed}/{r.scheduled}
                        </td>
                        <td className="px-3 py-2">
                          <TargetCell row={r} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {st && (
                            <span className="inline-flex items-center gap-1 text-[13px] font-medium" title={`Dài nhất: ${streakUnit(st.unit, st.longest)}`}>
                              <Flame className={cn("size-4", st.current > 0 ? "text-[#eb6834]" : "text-fg-3")} aria-hidden />
                              {streakUnit(st.unit, st.current)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Phone cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => {
              const st = streaks.get(r.taskId);
              return (
                <Card key={r.taskId} className="p-3" data-testid="habit-card">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{r.title}</span>
                    {r.paused && <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-3">Tạm dừng</span>}
                    <span className="text-[13px] font-semibold tabular">
                      {r.completed}/{r.scheduled}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {r.cells.map((c) => (
                      <div key={c.date} className="flex flex-col items-center gap-1">
                        <span className={cn("text-[10px] font-medium", c.date === now.today ? "text-accent" : "text-fg-3")}>
                          {WEEKDAY_SHORT[weekdayOf(c.date)]}
                        </span>
                        <HabitCellButton row={r} cell={c} isToday={c.date === now.today} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1">
                      <TargetCell row={r} />
                    </div>
                    {st && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-medium">
                        <Flame className={cn("size-4", st.current > 0 ? "text-[#eb6834]" : "text-fg-3")} aria-hidden />
                        {streakUnit(st.unit, st.current)}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12px] text-fg-3" aria-label="Chú thích">
            <li className="inline-flex items-center gap-1.5">
              <span className="grid size-4 place-items-center rounded bg-st-done text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              Hoàn thành
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="grid size-4 place-items-center rounded bg-st-overdue-soft text-st-overdue">
                <X className="size-3" strokeWidth={3} />
              </span>
              Bỏ lỡ (đã qua)
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="size-4 rounded bg-surface-2 ring-1 ring-inset ring-line-strong" />
              Chưa đến / chưa làm
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="text-[14px]">—</span> Không có lịch (không tính là bỏ lỡ)
            </li>
          </ul>

          <Card>
            <CardHeader title="Chuỗi ngày & độ đều đặn" subtitle="Tính đến hôm nay, trên toàn bộ lịch sử" />
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
              {rows.map((r) => {
                const st = streaks.get(r.taskId)!;
                return (
                  <div key={r.taskId} className="rounded-2xl border border-line bg-surface-2/40 p-4" data-testid="streak-card">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                      <span className="truncate text-[14px] font-medium">{r.title}</span>
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <Flame className={cn("mb-1 size-6", st.current > 0 ? "text-[#eb6834]" : "text-fg-3")} aria-hidden />
                      <span className="text-[30px] font-semibold leading-none tracking-tight" data-testid="streak-current">
                        {st.current}
                      </span>
                      <span className="mb-0.5 text-[13px] text-fg-3">{st.unit === "day" ? "ngày liên tiếp" : "lần liên tiếp"}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                      <dt className="text-fg-3">Dài nhất</dt>
                      <dd className="text-right font-medium tabular">{streakUnit(st.unit, st.longest)}</dd>
                      <dt className="text-fg-3">Tổng ngày hoàn thành</dt>
                      <dd className="text-right font-medium tabular">{st.totalCompletedDays}</dd>
                      <dt className="text-fg-3">Đều đặn tuần này</dt>
                      <dd className="text-right font-medium tabular">{formatPercent(st.weeklyConsistency)}</dd>
                      <dt className="text-fg-3">Đều đặn tháng này</dt>
                      <dd className="text-right font-medium tabular">{formatPercent(st.monthlyConsistency)}</dd>
                      <dt className="text-fg-3">Tuần đạt mục tiêu liên tiếp</dt>
                      <dd className="text-right font-medium tabular">{st.goalWeekStreak}</dd>
                    </dl>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex gap-3">
              <Info className="mt-0.5 size-4 shrink-0 text-fg-3" />
              <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
                <p className="font-medium text-fg">Cách tính</p>
                <p>
                  <b>Tổng</b> = số lần hoàn thành / số lần đã lên lịch trong tuần. Ô “—” là ngày không có lịch nên không bị tính là bỏ lỡ.
                  Mỗi lần thực hiện chỉ được tính một lần dù bạn tích/bỏ tích nhiều lần.
                </p>
                <p>
                  <b>Tỷ lệ đạt mục tiêu</b> = tổng số lần hoàn thành tính vào mục tiêu / tổng mục tiêu. Phần vượt mục tiêu của một thói quen không bù cho thói quen khác.
                  Nếu tuần đó lịch có ít lần hơn mục tiêu (mới tạo, tạm dừng, bỏ qua), mục tiêu được giảm theo số lần có lịch.
                </p>
                <p>
                  <b>Chuỗi</b> đếm số lần <i>có lịch</i> liên tiếp đã hoàn thành: ngày nghỉ theo lịch, ngày tạm dừng và lần “bỏ qua” không làm đứt chuỗi;
                  việc hôm nay chưa xong chỉ bị tính khi hết ngày.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
