"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ClipboardList, Ellipsis, Flag, GripVertical, Pause, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Card, EmptyState, Segmented } from "@/components/ui/misc";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { addDays, startOfWeek } from "@/lib/domain/dates";
import { buildOccurrences, currentVersion, isCounted, taskSpan } from "@/lib/domain/occurrences";
import { weeklyTargetFor } from "@/lib/domain/stats";
import type { Task, TaskVersion } from "@/lib/domain/types";
import { PRIORITY_LABEL, formatDate, shortSchedule } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { useTaskUI } from "./task-ui";

type Kind = "all" | "recurring" | "once" | "paused" | "ended";

interface RowModel {
  task: Task;
  version: TaskVersion;
  state: "active" | "paused" | "ended";
  recurring: boolean;
  week: { completed: number; scheduled: number; target: number };
  onceDone: boolean;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function SortableRow({ row, draggable }: { row: RowModel; draggable: boolean }) {
  const { categoriesById } = useEngine();
  const ui = useTaskUI();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.task.id, disabled: !draggable });
  const v = row.version;
  const category = v.categoryId ? categoriesById.get(v.categoryId) : null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 border-b border-line bg-surface px-2 py-3 last:border-0 sm:gap-3 sm:px-3",
        isDragging && "relative z-10 rounded-xl shadow-pop",
        row.state !== "active" && "bg-surface-2/40",
      )}
      data-testid="task-row"
      data-title={v.title}
    >
      <button
        type="button"
        className={cn("touch-none rounded-lg p-1.5 text-fg-3", draggable ? "cursor-grab hover:bg-surface-2 hover:text-fg active:cursor-grabbing" : "cursor-not-allowed opacity-30")}
        aria-label={`Kéo để sắp xếp: ${v.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: v.color }} aria-hidden />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => ui.editTask(row.task)}>
        <span className="flex items-center gap-2">
          <span className={cn("truncate text-[15px] font-medium", row.onceDone && "text-fg-3 line-through")}>{v.title}</span>
          {v.priority === "high" && <Flag className="size-3.5 shrink-0 text-st-overdue" aria-label="Ưu tiên cao" />}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-fg-3">
          <span>{shortSchedule(v)}</span>
          {category && (
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full" style={{ background: category.color }} />
              {category.name}
            </span>
          )}
          {v.weeklyTarget && <span>Mục tiêu {v.weeklyTarget} lần/tuần</span>}
          {v.priority !== "medium" && <span>Ưu tiên {PRIORITY_LABEL[v.priority].toLowerCase()}</span>}
        </span>
      </button>
      <div className="hidden shrink-0 text-right sm:block">
        {row.state === "paused" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-2">
            <Pause className="size-3" /> Tạm dừng
          </span>
        ) : row.state === "ended" ? (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-3">Đã kết thúc</span>
        ) : row.recurring ? (
          <span className="text-[12px] text-fg-2 tabular" title="Tuần này">
            Tuần này: <b>{row.week.completed}</b>/{row.week.target || row.week.scheduled}
          </span>
        ) : (
          <span className="text-[12px] text-fg-3">{row.onceDone ? "Đã hoàn thành" : formatDate(v.startDate, "short")}</span>
        )}
      </div>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Thao tác: ${v.title}`}>
            <Ellipsis />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => ui.editTask(row.task)}>
            <Pencil /> Chỉnh sửa
          </MenuItem>
          {row.recurring && row.state === "active" && (
            <MenuItem onSelect={() => ui.pauseTask(row.task)}>
              <Pause /> Tạm dừng thói quen
            </MenuItem>
          )}
          {row.state === "paused" && (
            <MenuItem onSelect={() => ui.resumeTask(row.task)}>
              <Play /> Tiếp tục
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem tone="danger" onSelect={() => ui.deleteTask(row.task)}>
            <Trash2 /> Xóa
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

export function TaskManager() {
  const { snapshot, index, now } = useEngine();
  const actions = useAppActions();
  const ui = useTaskUI();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [kind, setKind] = useState<Kind>("all");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const weekStart = startOfWeek(now.today);
  const ordered = useMemo(() => [...snapshot.tasks].sort((a, b) => a.position - b.position), [snapshot.tasks]);
  const weekOccs = useMemo(() => buildOccurrences(index, weekStart, addDays(weekStart, 6)), [index, weekStart]);

  const rows: RowModel[] = useMemo(
    () =>
      ordered.map((task) => {
        const version = currentVersion(task, now.today);
        const span = taskSpan(task);
        const recurring = task.versions.some((x) => x.recurrence.type !== "none");
        const state: RowModel["state"] = task.pausedAt
          ? "paused"
          : recurring && (!span || (span.end !== null && span.end < now.today))
            ? "ended"
            : "active";
        const mine = weekOccs.filter((o) => o.taskId === task.id && isCounted(o));
        const completed = mine.filter((o) => o.status === "completed").length;
        const { target } = weeklyTargetFor(task, weekStart, mine.length);
        const onceDone = !recurring && index.rowsByDate.some((r) => r.taskId === task.id && r.status === "completed");
        return { task, version, state, recurring, week: { completed, scheduled: mine.length, target }, onceDone };
      }),
    [ordered, now.today, weekOccs, weekStart, index],
  );

  const q = fold(query.trim());
  const filtered = rows.filter((r) => {
    if (q && !fold(`${r.version.title} ${r.version.description}`).includes(q)) return false;
    if (cat !== "all" && (cat === "none" ? r.version.categoryId !== null : r.version.categoryId !== cat)) return false;
    if (kind === "recurring" && (!r.recurring || r.state !== "active")) return false;
    if (kind === "once" && r.recurring) return false;
    if (kind === "paused" && r.state !== "paused") return false;
    if (kind === "ended" && r.state !== "ended") return false;
    return true;
  });

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const visible = filtered.map((r) => r.task.id);
    const from = visible.indexOf(String(active.id));
    const to = visible.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const moved = arrayMove(visible, from, to);
    // Only the visible tasks swap places; hidden ones keep their slots.
    const full = ordered.map((t) => t.id);
    const visibleSet = new Set(visible);
    const slots = full.map((id, i) => (visibleSet.has(id) ? i : -1)).filter((i) => i >= 0);
    const result = [...full];
    slots.forEach((slot, k) => {
      result[slot] = moved[k]!;
    });
    actions.reorder.mutate(result);
  }

  return (
    <div>
      <PageHeader
        title="Quản lý công việc"
        subtitle={`${snapshot.tasks.length} công việc · kéo thả để sắp xếp thứ tự hiển thị`}
        actions={
          <Button variant="primary" onClick={() => ui.openCreate()}>
            <Plus /> Thêm công việc mới
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm công việc…"
            aria-label="Tìm kiếm công việc"
            className="pl-9 pr-9"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-fg-3 hover:text-fg" aria-label="Xóa tìm kiếm">
              <X className="size-4" />
            </button>
          )}
        </div>
        <Segmented
          label="Loại công việc"
          value={kind}
          onChange={setKind}
          className="scrollbar-thin max-w-full overflow-x-auto"
          options={[
            { value: "all", label: "Tất cả" },
            { value: "recurring", label: "Lặp lại" },
            { value: "once", label: "Một lần" },
            { value: "paused", label: "Tạm dừng" },
            { value: "ended", label: "Đã kết thúc" },
          ]}
        />
      </div>
      <div className="scrollbar-thin -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Lọc theo danh mục">
        {[{ id: "all", name: "Tất cả danh mục", color: null as string | null }, ...snapshot.categories, { id: "none", name: "Không danh mục", color: null }].map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={cat === c.id}
            onClick={() => setCat(c.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ring-1 transition-colors",
              cat === c.id ? "bg-fg text-bg ring-fg" : "bg-surface text-fg-2 ring-line-strong hover:bg-surface-2",
            )}
          >
            {c.color && <span className="size-2 rounded-full" style={{ background: c.color }} />}
            {c.name}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title={snapshot.tasks.length === 0 ? "Bạn chưa có công việc nào" : "Không có công việc phù hợp"}
            description={snapshot.tasks.length === 0 ? "Tất cả công việc đều do bạn tự tạo. Bắt đầu bằng nút “Thêm công việc mới”." : "Thử đổi từ khóa hoặc bộ lọc."}
            action={
              snapshot.tasks.length === 0 ? (
                <Button variant="primary" onClick={() => ui.openCreate()}>
                  <Plus /> Thêm công việc mới
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={filtered.map((r) => r.task.id)} strategy={verticalListSortingStrategy}>
              <ul aria-label="Danh sách công việc">
                {filtered.map((r) => (
                  <SortableRow key={r.task.id} row={r} draggable />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>
      <p className="mt-3 px-1 text-[12px] text-fg-3">
        Thứ tự ở đây được dùng cho danh sách hằng ngày khi các việc cùng giờ (hoặc không đặt giờ). Bàn phím: chọn tay nắm, nhấn Space rồi dùng ↑ ↓.
      </p>
    </div>
  );
}
