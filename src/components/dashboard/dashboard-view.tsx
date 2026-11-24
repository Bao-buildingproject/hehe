"use client";

import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, Clock, Info, Minus, Trophy } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { HEAT_CLASS, HEAT_INK, HeatLegend } from "@/components/calendar/views";
import { WeekNav } from "@/components/habits/habits-view";
import { Card, CardHeader, ProgressBar, Segmented } from "@/components/ui/misc";
import { useEngine } from "@/lib/client/app-context";
import {
  type DateStr,
  addDays,
  addMonths,
  isValidDateStr,
  isoWeek,
  parseDate,
  startOfMonth,
  startOfWeek,
  weekdayOf,
} from "@/lib/domain/dates";
import { buildOccurrences } from "@/lib/domain/occurrences";
import { type HeatCell, monthSummary, periodStats, weekSummary, weeklyTrend } from "@/lib/domain/stats";
import { WEEKDAY_LONG, WEEKDAY_SHORT, formatDate, formatDelta, formatPercent, monthLabel, weekLabel } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { ChartCard, DataTable, LegendItem, TrendChart, WeekColumnsChart } from "./charts";

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-[12px] text-fg-3">Chưa đủ dữ liệu để so sánh</span>;
  const up = value > 0.0005;
  const down = value < -0.0005;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", up ? "text-success-text" : down ? "text-danger-text" : "text-fg-3")}>
      <Icon className="size-3.5" aria-hidden />
      {formatDelta(value)} <span className="font-normal text-fg-3">{suffix}</span>
    </span>
  );
}

function MonthHeatmap({ cells, month }: { cells: HeatCell[]; month: DateStr }) {
  // GitHub-style: one column per week, rows Monday → Sunday.
  const first = startOfWeek(startOfMonth(month));
  const last = cells.at(-1)?.date ?? month;
  const weeks: DateStr[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  const byDate = new Map(cells.map((c) => [c.date, c]));
  const m = parseDate(month).m;
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="border-separate border-spacing-1" aria-label={`Mức độ hoàn thành ${monthLabel(month)}`}>
        <thead>
          <tr>
            <th className="w-8" />
            {weeks.map((w) => (
              <th key={w} scope="col" className="text-[10px] font-medium text-fg-3">
                T{isoWeek(w).week}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <tr key={row}>
              <th scope="row" className="pr-1 text-right text-[10px] font-medium text-fg-3">
                {WEEKDAY_SHORT[(row + 1) as 1]}
              </th>
              {weeks.map((w) => {
                const d = addDays(w, row);
                const c = byDate.get(d);
                if (parseDate(d).m !== m || !c) return <td key={d} className="size-8" aria-hidden />;
                const label = `${formatDate(d, "long")}: ${c.scheduled ? `${c.completed}/${c.scheduled} việc hoàn thành` : "không có lịch"}`;
                return (
                  <td key={d} className="p-0">
                    <span
                      tabIndex={0}
                      title={label}
                      aria-label={label}
                      className={cn(
                        "grid size-8 place-items-center rounded-md text-[10px] font-medium tabular outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent",
                        HEAT_CLASS[c.level],
                        HEAT_INK[c.level],
                        c.isToday && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                      )}
                    >
                      {parseDate(d).d}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardView() {
  const { index, now, snapshot } = useEngine();
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("week");
  const weekStart = startOfWeek(raw && isValidDateStr(raw) ? raw : now.today);
  const setWeek = (d: DateStr) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("week", startOfWeek(d));
    window.history.replaceState(null, "", `${pathname}?${sp.toString()}`);
  };
  const [historyMode, setHistoryMode] = useState<"week" | "month">("week");

  const s = useMemo(() => weekSummary(index, weekStart, now), [index, weekStart, now]);
  const today = useMemo(() => periodStats(buildOccurrences(index, now.today, now.today), now), [index, now]);
  const trend = useMemo(() => weeklyTrend(index, weekStart, 8, now), [index, weekStart, now]);
  const month = useMemo(() => monthSummary(index, weekStart, now), [index, weekStart, now]);
  const history = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const ws = addDays(weekStart, -7 * i);
        const w = weekSummary(index, ws, now);
        return { ws, w };
      }),
    [index, weekStart, now],
  );
  const monthHistory = useMemo(
    () => Array.from({ length: 6 }, (_, i) => monthSummary(index, addMonths(startOfMonth(weekStart), -i), now)),
    [index, weekStart, now],
  );

  const columns = s.days.map((d) => ({
    label: WEEKDAY_SHORT[weekdayOf(d.date)],
    fullLabel: `${WEEKDAY_LONG[weekdayOf(d.date)]}, ${formatDate(d.date, "dayMonth")}`,
    scheduled: d.scheduled,
    completed: d.completed,
    rate: d.rate,
  }));
  const trendData = trend.map((p) => ({
    label: `T${p.week}`,
    fullLabel: weekLabel(p.weekStart),
    pct: p.rate === null ? null : p.rate * 100,
    completed: p.completed,
    scheduled: p.scheduled,
    partial: p.partial,
  }));
  const cmp = s.comparison;
  const windowLabel =
    cmp && cmp.partial ? `T2 → ${WEEKDAY_SHORT[weekdayOf(now.today)]}` : "cả tuần";

  return (
    <div>
      <PageHeader title="Thống kê hiệu suất" subtitle="Tự động tổng hợp từ Thứ Hai đến Chủ Nhật, cập nhật ngay khi bạn tích hoàn thành." />
      <div className="mb-4">
        <WeekNav weekStart={weekStart} today={now.today} onChange={setWeek} />
      </div>

      {/* Headline tiles */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4 sm:col-span-2 xl:col-span-1 xl:row-span-1">
          <p className="text-[13px] text-fg-3">Tỷ lệ hoàn thành tuần</p>
          <p className="mt-1 text-[48px] font-semibold leading-none tracking-tight" data-testid="week-rate">
            {formatPercent(s.stats.completionRate, "0%")}
          </p>
          <p className="mt-2 text-[13px] text-fg-2">
            {s.stats.completed}/{s.stats.scheduled} việc đã lên lịch
            {s.toDate && s.state === "current" ? ` · đến hôm nay ${formatPercent(s.toDate.completionRate)}` : ""}
          </p>
          <div className="mt-2">
            <Delta value={cmp?.rateDelta ?? null} suffix={`so với tuần trước (${windowLabel})`} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-fg-3">Hôm nay · {formatDate(now.today, "short")}</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tracking-tight" data-testid="today-progress">
            {today.completed}/{today.scheduled}
          </p>
          <ProgressBar value={today.completionRate} className="mt-3" label="Tiến độ hôm nay" tone={today.scheduled > 0 && today.completed === today.scheduled ? "done" : "accent"} />
          <p className="mt-2 text-[12px] text-fg-3">{formatPercent(today.completionRate, "Chưa có việc")} hoàn thành</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-fg-3">Đạt mục tiêu tuần</p>
          <p className="mt-1 text-[30px] font-semibold leading-none tracking-tight" data-testid="dash-goal-rate">
            {formatPercent(s.goal.rate)}
          </p>
          <ProgressBar value={s.goal.rate} className="mt-3" label="Tỷ lệ đạt mục tiêu" tone={s.goal.rate === 1 ? "done" : "accent"} />
          <p className="mt-2 text-[12px] text-fg-3">
            {s.goal.countedCompletions}/{s.goal.totalTarget} lần theo mục tiêu · {s.goal.habitsMet}/{s.goal.habitsWithTarget} thói quen đạt
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-fg-3">Ngày hiệu quả nhất</p>
          {s.bestDay ? (
            <>
              <p className="mt-1 text-[24px] font-semibold leading-tight tracking-tight">{WEEKDAY_LONG[weekdayOf(s.bestDay.date)]}</p>
              <p className="mt-1 text-[13px] text-fg-2">
                {formatDate(s.bestDay.date, "dayMonth")} · {formatPercent(s.bestDay.rate)} ({s.bestDay.completed}/{s.bestDay.scheduled})
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-fg-3">Chưa có dữ liệu</p>
          )}
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Đã lên lịch", value: s.stats.scheduled, note: `trong ${s.stats.activeDays} ngày`, icon: Clock, tone: "text-fg-3" },
          {
            label: "Hoàn thành",
            value: s.stats.completed,
            // Completions (lần) and days with at least one completion (ngày) are different numbers.
            note: `lần · ${s.stats.completedDays} ngày có hoàn thành`,
            icon: Check,
            tone: "text-st-done",
          },
          { label: "Chưa hoàn thành", value: s.stats.notCompleted, note: null, icon: Minus, tone: "text-st-idle" },
          { label: "Quá hạn", value: s.stats.overdue, note: null, icon: CircleAlert, tone: "text-st-overdue" },
        ].map((k) => (
          <Card key={k.label} className="flex items-center gap-3 px-4 py-3">
            <k.icon className={cn("size-5 shrink-0", k.tone)} aria-hidden />
            <div className="min-w-0">
              <p className="text-[12px] text-fg-3">{k.label}</p>
              <p className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                <span className="text-[20px] font-semibold tabular" data-testid={`kpi-${k.label}`}>
                  {k.value}
                </span>
                {k.note && <span className="text-[12px] text-fg-3">{k.note}</span>}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Tổng quan tuần"
          subtitle="Số việc hoàn thành trên số việc đã lên lịch mỗi ngày"
          legend={
            <div className="flex gap-4">
              <LegendItem swatch="bar" label="Hoàn thành" />
              <LegendItem swatch="track" label="Đã lên lịch" />
            </div>
          }
          table={
            <DataTable
              head={["Ngày", "Hoàn thành", "Đã lên lịch", "Tỷ lệ"]}
              rows={columns.map((c) => [c.fullLabel, c.completed, c.scheduled, formatPercent(c.rate)])}
            />
          }
        >
          <WeekColumnsChart data={columns} />
        </ChartCard>

        <Card className="flex flex-col p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">So sánh với tuần trước</h2>
          <p className="mt-0.5 text-[13px] text-fg-3">
            {cmp ? (cmp.partial ? `Cùng các ngày ${windowLabel} của hai tuần` : "Cả tuần, cùng cách tính") : "Tuần chưa bắt đầu"}
          </p>
          {cmp ? (
            <div className="mt-4 flex flex-1 flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-accent-soft/60 p-3">
                  <p className="text-[12px] text-fg-2">Tuần này</p>
                  <p className="text-[26px] font-semibold leading-tight tracking-tight" data-testid="cmp-current">
                    {formatPercent(cmp.current.completionRate)}
                  </p>
                  <p className="text-[12px] text-fg-3 tabular">
                    {cmp.current.completed}/{cmp.current.scheduled} việc
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-[12px] text-fg-2">Tuần trước</p>
                  <p className="text-[26px] font-semibold leading-tight tracking-tight" data-testid="cmp-previous">
                    {formatPercent(cmp.previous.completionRate)}
                  </p>
                  <p className="text-[12px] text-fg-3 tabular">
                    {cmp.previous.completed}/{cmp.previous.scheduled} việc
                  </p>
                </div>
              </div>
              <Delta value={cmp.rateDelta} suffix="tỷ lệ hoàn thành" />
              <p className="text-[13px] text-fg-2">
                {cmp.completedDelta === 0
                  ? "Số việc hoàn thành bằng tuần trước."
                  : `${cmp.completedDelta > 0 ? "Nhiều hơn" : "Ít hơn"} ${Math.abs(cmp.completedDelta)} việc hoàn thành so với tuần trước.`}
              </p>
              {cmp.partial && (
                <p className="mt-auto text-[12px] text-fg-3">
                  Tuần trước cả tuần: {formatPercent(cmp.previousFull.completionRate)} ({cmp.previousFull.completed}/{cmp.previousFull.scheduled}).
                </p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-fg-3">Khi tuần bắt đầu, phần so sánh sẽ hiện ở đây.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Xu hướng 8 tuần"
          subtitle="Tỷ lệ hoàn thành mỗi tuần (điểm rỗng = tuần đang diễn ra, tính đến hôm nay)"
          table={
            <DataTable
              head={["Tuần", "Hoàn thành", "Đã lên lịch", "Tỷ lệ"]}
              rows={trendData.map((t) => [t.fullLabel + (t.partial ? " *" : ""), t.completed, t.scheduled, t.pct === null ? "—" : formatPercent(t.pct / 100)])}
            />
          }
        >
          <TrendChart data={trendData} />
        </ChartCard>

        <Card>
          <CardHeader title="Hiệu suất thói quen" subtitle="Số lần hoàn thành so với mục tiêu tuần" />
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            {s.habits.length === 0 && <p className="text-[14px] text-fg-3">Chưa có thói quen nào trong tuần này.</p>}
            {s.habits.map((h) => (
              <div key={h.taskId}>
                <div className="mb-1 flex items-center gap-2 text-[13px]">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: h.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{h.title}</span>
                  {h.targetMet && <Trophy className="size-3.5 text-st-done" aria-label="Đạt mục tiêu" />}
                  <span className="text-fg-2 tabular">
                    {h.completed}/{h.target > 0 ? h.target : h.scheduled}
                  </span>
                </div>
                <ProgressBar value={h.progress ?? 0} size="sm" tone={h.targetMet ? "done" : "accent"} label={`${h.title}: ${h.completed}/${h.target}`} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title={`Bản đồ nhiệt ${monthLabel(month.monthStart).toLowerCase()}`}
            subtitle={`${month.stats.completed}/${month.stats.scheduled} việc · ${formatPercent(month.stats.completionRate)}`}
          />
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <MonthHeatmap cells={month.heat} month={month.monthStart} />
            <HeatLegend />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Lịch sử hoàn thành"
            subtitle="Nhấn một dòng để xem lại tuần đó"
            action={
              <Segmented
                size="sm"
                label="Xem theo"
                value={historyMode}
                onChange={setHistoryMode}
                options={[
                  { value: "week", label: "Tuần" },
                  { value: "month", label: "Tháng" },
                ]}
              />
            }
          />
          <div className="p-3 sm:p-4">
            {historyMode === "week" ? (
              <ul className="flex flex-col">
                {history.map(({ ws, w }) => (
                  <li key={ws}>
                    <button
                      type="button"
                      onClick={() => setWeek(ws)}
                      className={cn(
                        "grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] hover:bg-surface-2",
                        ws === weekStart && "bg-accent-soft/60",
                      )}
                    >
                      <span className="min-w-0 truncate">
                        {weekLabel(ws)}
                        {w.state === "current" && <span className="ml-1 text-fg-3">(đang diễn ra)</span>}
                      </span>
                      <span className="text-fg-3 tabular">
                        {w.stats.completed}/{w.stats.scheduled}
                      </span>
                      <span className="w-16 text-right font-semibold tabular">{formatPercent(w.stats.completionRate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col">
                {monthHistory.map((mh) => (
                  <li key={mh.monthStart}>
                    <button
                      type="button"
                      onClick={() => setWeek(mh.monthStart)}
                      className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl px-2 py-2 text-left text-[13px] hover:bg-surface-2"
                    >
                      <span>
                        {monthLabel(mh.monthStart)}
                        {mh.state === "current" && <span className="ml-1 text-fg-3">(đang diễn ra)</span>}
                      </span>
                      <span className="text-fg-3 tabular">
                        {mh.stats.completed}/{mh.stats.scheduled}
                      </span>
                      <span className="w-16 text-right font-semibold tabular">{formatPercent(mh.stats.completionRate)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-4 sm:p-5">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-fg-3" />
          <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
            <p className="font-medium text-fg">Cách tính</p>
            <p>
              <b>Tỷ lệ hoàn thành</b> = việc đã hoàn thành / tổng việc đã lên lịch × 100%. Việc bị hủy hoặc bỏ qua không tính vào tổng.
              Mỗi lần thực hiện chỉ được tính một lần, dù bạn tích/bỏ tích nhiều lần.
            </p>
            <p>
              <b>Quá hạn</b> chỉ gồm việc đã qua giờ kết thúc (hoặc đã hết ngày) mà chưa xong; việc chưa đến hạn không bao giờ bị tính là quá hạn.
            </p>
            <p>
              <b>So sánh tuần</b>: với tuần đang diễn ra, hai tuần được so trên cùng các ngày (Thứ Hai → hôm nay); với tuần đã kết thúc, so cả tuần.
              <b> Tỷ lệ đạt mục tiêu</b> khác tỷ lệ hoàn thành: nó so số lần làm với mục tiêu tuần bạn đặt cho từng thói quen.
            </p>
            <p>Múi giờ: {snapshot.user.timezone}. Tuần bắt đầu Thứ Hai, kết thúc Chủ Nhật.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
