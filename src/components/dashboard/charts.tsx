"use client";

import { type ReactNode, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/** Card that can switch between the chart and an accessible table of the same numbers. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  table: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-fg-3 hover:bg-surface-2 hover:text-fg"
            aria-pressed={asTable}
          >
            {asTable ? "Xem biểu đồ" : "Xem bảng"}
          </button>
        }
      />
      {legend && !asTable ? <div className="px-4 pt-2 sm:px-5">{legend}</div> : null}
      <div className="flex-1 px-2 pb-3 pt-2 sm:px-3">{asTable ? <div className="px-2 sm:px-2">{table}</div> : children}</div>
    </Card>
  );
}

export function LegendItem({ swatch, label }: { swatch: "bar" | "track" | "line"; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-2">
      {swatch === "line" ? (
        <span className="h-0.5 w-4 rounded-full bg-accent" />
      ) : (
        <span className={cn("size-2.5 rounded-[3px]", swatch === "bar" ? "bg-accent" : "bg-track")} />
      )}
      {label}
    </span>
  );
}

function TooltipBox({ title, rows }: { title: string; rows: { value: ReactNode; label: string; key: "accent" | "track" | "none" }[] }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-line bg-surface px-3 py-2 shadow-pop">
      <p className="mb-1 text-[12px] text-fg-3">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-[13px]">
          {r.key !== "none" && <span className={cn("h-0.5 w-3 rounded-full", r.key === "accent" ? "bg-accent" : "bg-track")} />}
          <span className="font-semibold text-fg tabular">{r.value}</span>
          <span className="text-fg-3">{r.label}</span>
        </p>
      ))}
    </div>
  );
}

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

export interface DayColumn {
  label: string;
  fullLabel: string;
  scheduled: number;
  completed: number;
  rate: number | null;
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: DayColumn;
}

/** Column = scheduled (light track); its filled part = completed. Thin, 4px rounded data end. */
function TrackFillShape(props: ShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload || payload.scheduled === 0) return <g />;
  const fillH = height * (payload.completed / payload.scheduled);
  return (
    <g>
      <path d={topRounded(x, y, width, height, 4)} fill="var(--track)" />
      {fillH > 0 && <path d={topRounded(x, y + height - fillH, width, fillH, 4)} fill="var(--accent)" />}
    </g>
  );
}

const axisTick = { fill: "var(--fg-3)", fontSize: 12 };

export function WeekColumnsChart({ data }: { data: DayColumn[] }) {
  const max = Math.max(1, ...data.map((d) => d.scheduled));
  return (
    <div className="h-[240px] w-full" role="img" aria-label="Biểu đồ cột: số việc hoàn thành trên số việc đã lên lịch theo ngày">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
          <YAxis allowDecimals={false} domain={[0, max]} tick={axisTick} tickLine={false} axisLine={false} width={36} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as DayColumn) : null;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.fullLabel}
                  rows={[
                    { value: p.completed, label: "hoàn thành", key: "accent" },
                    { value: p.scheduled, label: "đã lên lịch", key: "track" },
                    { value: p.rate === null ? "—" : `${Math.round(p.rate * 1000) / 10}%`.replace(".", ","), label: "tỷ lệ", key: "none" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="scheduled" maxBarSize={24} shape={(p: unknown) => <TrackFillShape {...(p as ShapeProps)} />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface TrendDatum {
  label: string;
  fullLabel: string;
  pct: number | null;
  completed: number;
  scheduled: number;
  partial: boolean;
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  const lastIndex = data.map((d) => d.pct !== null).lastIndexOf(true);
  return (
    <div className="h-[240px] w-full" role="img" aria-label="Biểu đồ đường: tỷ lệ hoàn thành theo tuần">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 40, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0] ? (payload[0].payload as TrendDatum) : null;
              if (!p) return null;
              return (
                <TooltipBox
                  title={p.fullLabel + (p.partial ? " (đến hôm nay)" : "")}
                  rows={[
                    { value: p.pct === null ? "—" : `${String(Math.round(p.pct * 10) / 10).replace(".", ",")}%`, label: "hoàn thành", key: "accent" },
                    { value: `${p.completed}/${p.scheduled}`, label: "việc", key: "none" },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls
            isAnimationActive={false}
            activeDot={{ r: 5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: TrendDatum }) => {
              const { cx, cy, index, payload } = props;
              if (cx === undefined || cy === undefined || !payload || payload.pct === null) return <g key={`d${index}`} />;
              return (
                <g key={`d${index}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={payload.partial ? "var(--surface)" : "var(--accent)"}
                    stroke={payload.partial ? "var(--accent)" : "var(--surface)"}
                    strokeWidth={2}
                  />
                  {index === lastIndex && (
                    <text x={cx + 8} y={cy + 4} fontSize={12} fill="var(--fg)" fontWeight={600}>
                      {`${Math.round(payload.pct)}%`}
                    </text>
                  )}
                </g>
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-fg-3">
            {head.map((h, i) => (
              <th key={h} scope="col" className={cn("py-2 pr-3 font-medium", i > 0 && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])} className="border-b border-line last:border-0">
              {r.map((c, i) => (
                <td key={i} className={cn("py-1.5 pr-3", i > 0 && "text-right tabular")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
