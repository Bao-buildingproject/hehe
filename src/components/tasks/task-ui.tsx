"use client";

import {
  CalendarDays,
  Clock,
  Flag,
  Pause,
  Pencil,
  Play,
  Repeat,
  Tag,
  Trash2,
} from "lucide-react";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { zonedParts } from "@/lib/domain/dates";
import { currentVersion, displayStatus } from "@/lib/domain/occurrences";
import type { Occurrence, OccurrenceStatus, Task, TaskFields } from "@/lib/domain/types";
import { PRIORITY_LABEL, STORED_STATUS_LABEL, describeRule, formatDate, formatTimeRange } from "@/lib/domain/vi";
import { cn } from "@/lib/utils";
import { StatusPill } from "./status";
import { type FormMode, TaskFormDialog } from "./task-form-dialog";

interface TaskUI {
  openCreate: (prefill?: Partial<TaskFields>) => void;
  openOccurrence: (occ: Occurrence) => void;
  editOccurrence: (occ: Occurrence) => void;
  deleteOccurrence: (occ: Occurrence) => void;
  editTask: (task: Task) => void;
  deleteTask: (task: Task) => void;
  pauseTask: (task: Task) => void;
  resumeTask: (task: Task) => void;
}

const TaskUIContext = createContext<TaskUI | null>(null);

export function useTaskUI(): TaskUI {
  const ctx = useContext(TaskUIContext);
  if (!ctx) throw new Error("useTaskUI must be used inside TaskUIProvider");
  return ctx;
}

interface Choice {
  label: string;
  description?: string;
  tone?: "danger";
  onSelect: () => void;
}

function ChoiceDialog({ title, description, choices, onClose }: { title: string; description?: string; choices: Choice[]; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={title} description={description} size="sm">
        <div className="flex flex-col gap-2 pb-2 pt-1">
          {choices.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => {
                onClose();
                c.onSelect();
              }}
              className={cn(
                "rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-2",
                c.tone === "danger" && "hover:border-st-overdue/40 hover:bg-st-overdue-soft",
              )}
            >
              <span className={cn("block text-[14px] font-medium", c.tone === "danger" ? "text-danger-text" : "text-fg")}>{c.label}</span>
              {c.description ? <span className="mt-0.5 block text-[12px] text-fg-3">{c.description}</span> : null}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatCompletedAt(iso: string, timeZone: string): string {
  const p = zonedParts(new Date(iso), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.hour)}:${pad(p.minute)} ngày ${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

function OccurrenceDialog({ occ, onClose, ui }: { occ: Occurrence; onClose: () => void; ui: TaskUI }) {
  const { now, snapshot, categoriesById, index } = useEngine();
  const actions = useAppActions();
  const task = index.taskById.get(occ.taskId);
  // Re-read the live occurrence so status changes show immediately.
  const live = useMemo(() => {
    const row = index.rowByKey.get(occ.key);
    if (!row) return { ...occ, status: "pending" as OccurrenceStatus, completedAt: null };
    return { ...occ, status: row.status, completedAt: row.completedAt };
  }, [index, occ]);
  if (!task) return null;
  const status = displayStatus(live, now);
  const category = live.categoryId ? categoriesById.get(live.categoryId) : null;
  const version = task.versions.find((v) => v.id === occ.versionId) ?? currentVersion(task, now.today);

  const statusOptions: OccurrenceStatus[] = ["pending", "in_progress", "completed", "skipped"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={
          <span className="flex items-center gap-2">
            <span className="h-5 w-1.5 shrink-0 rounded-full" style={{ background: live.color }} aria-hidden />
            <span className={cn("min-w-0 break-words", live.status === "completed" && "text-fg-2")}>{live.title}</span>
          </span>
        }
        size="md"
        footer={
          <>
            <Button variant="danger-ghost" onClick={() => ui.deleteOccurrence(live)} className="sm:mr-auto">
              <Trash2 /> Xóa
            </Button>
            {live.recurring && !task.pausedAt && (
              <Button variant="ghost" onClick={() => ui.pauseTask(task)}>
                <Pause /> Tạm dừng thói quen
              </Button>
            )}
            <Button variant="primary" onClick={() => ui.editOccurrence(live)}>
              <Pencil /> Sửa
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} />
            {live.moved && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-2">Đã dời từ {formatDate(live.originalDate, "dayMonth")}</span>}
            {live.orphan && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-2">Lịch sử (không còn trong lịch)</span>}
          </div>

          <dl className="grid gap-2.5 text-[14px]">
            <div className="flex items-start gap-3">
              <dt className="sr-only">Ngày</dt>
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
              <dd>{formatDate(live.date, "long")}</dd>
            </div>
            {(live.startTime || live.endTime) && (
              <div className="flex items-start gap-3">
                <dt className="sr-only">Giờ</dt>
                <Clock className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                <dd>{formatTimeRange(live.startTime, live.endTime)}</dd>
              </div>
            )}
            {live.recurring && (
              <div className="flex items-start gap-3">
                <dt className="sr-only">Lặp lại</dt>
                <Repeat className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                <dd>
                  {describeRule(version.recurrence)}
                  {version.weeklyTarget ? ` · mục tiêu ${version.weeklyTarget} lần/tuần` : ""}
                  {task.pausedAt ? " · đang tạm dừng" : ""}
                </dd>
              </div>
            )}
            {category && (
              <div className="flex items-start gap-3">
                <dt className="sr-only">Danh mục</dt>
                <Tag className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                <dd className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: category.color }} />
                  {category.name}
                </dd>
              </div>
            )}
            <div className="flex items-start gap-3">
              <dt className="sr-only">Ưu tiên</dt>
              <Flag className={cn("mt-0.5 size-4 shrink-0", live.priority === "high" ? "text-st-overdue" : "text-fg-3")} aria-hidden />
              <dd>Ưu tiên {PRIORITY_LABEL[live.priority].toLowerCase()}</dd>
            </div>
          </dl>

          {live.description && (
            <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[14px] leading-relaxed text-fg-2">{live.description}</p>
          )}

          <div>
            <p className="mb-2 text-[13px] font-medium text-fg-2">Trạng thái</p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Trạng thái">
              {statusOptions.map((s) => {
                const active = live.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => actions.setStatus(live, s)}
                    className={cn(
                      "rounded-xl px-2 py-2 text-[13px] font-medium ring-1 transition-colors",
                      active ? "bg-accent text-accent-fg ring-accent" : "bg-surface text-fg-2 ring-line-strong hover:bg-surface-2",
                    )}
                  >
                    {STORED_STATUS_LABEL[s]}
                  </button>
                );
              })}
            </div>
            {live.status === "cancelled" && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => actions.setStatus(live, "pending")}>
                Khôi phục lần này
              </Button>
            )}
            {live.completedAt && live.status === "completed" && (
              <p className="mt-2 text-[12px] text-fg-3">Hoàn thành lúc {formatCompletedAt(live.completedAt, snapshot.user.timezone)}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Modal =
  | { type: "form"; mode: FormMode }
  | { type: "occurrence"; occ: Occurrence }
  | { type: "choice"; title: string; description?: string; choices: Choice[] }
  | null;

export function TaskUIProvider({ children }: { children: ReactNode }) {
  const { index, now } = useEngine();
  const actions = useAppActions();
  const confirm = useConfirm();
  const [modal, setModal] = useState<Modal>(null);
  const close = useCallback(() => setModal(null), []);

  const findTask = useCallback((id: string) => index.taskById.get(id), [index]);

  const ui: TaskUI = useMemo(() => {
    const api: TaskUI = {
      openCreate: (prefill) => setModal({ type: "form", mode: { kind: "create", prefill } }),
      openOccurrence: (occ) => setModal({ type: "occurrence", occ }),
      editTask: (task) => setModal({ type: "form", mode: { kind: "series", task } }),
      editOccurrence: (occ) => {
        const task = findTask(occ.taskId);
        if (!task) return;
        if (!occ.recurring || occ.orphan) {
          setModal({ type: "form", mode: occ.orphan ? { kind: "occurrence", task, occ } : { kind: "series", task } });
          return;
        }
        setModal({
          type: "choice",
          title: "Sửa công việc lặp lại",
          description: `“${occ.title}” · ${formatDate(occ.originalDate, "long")}`,
          choices: [
            {
              label: "Chỉ lần này",
              description: "Đổi tên, giờ, ngày hoặc ưu tiên cho riêng lần này.",
              onSelect: () => setModal({ type: "form", mode: { kind: "occurrence", task, occ } }),
            },
            {
              label: "Lần này và các lần sau",
              description: "Đổi lịch lặp lại, mục tiêu, danh mục… Các lần trước giữ nguyên lịch sử.",
              onSelect: () => setModal({ type: "form", mode: { kind: "future", task, occ } }),
            },
          ],
        });
      },
      deleteOccurrence: (occ) => {
        const task = findTask(occ.taskId);
        if (!task) return;
        const completedCount = index.rowsByDate.filter((r) => r.taskId === task.id && r.status === "completed").length;
        const deleteAll = async () => {
          const ok = await confirm({
            title: `Xóa vĩnh viễn “${occ.title}”?`,
            description:
              completedCount > 0
                ? `Toàn bộ lịch và ${completedCount} lần hoàn thành trong lịch sử sẽ bị xóa. Không thể hoàn tác (trừ khi khôi phục từ bản sao lưu).`
                : "Công việc và toàn bộ lịch của nó sẽ bị xóa.",
            confirmLabel: "Xóa vĩnh viễn",
            tone: "danger",
          });
          if (!ok) return;
          await actions.deleteTask.mutateAsync(task.id).then(() => toast.success("Đã xóa công việc")).catch(() => undefined);
        };
        if (!occ.recurring) {
          setModal(null);
          void deleteAll();
          return;
        }
        setModal({
          type: "choice",
          title: "Xóa công việc lặp lại",
          description: `“${occ.title}” · ${formatDate(occ.originalDate, "long")}`,
          choices: [
            {
              label: "Chỉ lần này",
              description: "Hủy riêng lần này (có thể khôi phục).",
              onSelect: () => {
                actions.setStatus(occ, "cancelled");
                toast("Đã hủy lần này", {
                  action: { label: "Hoàn tác", onClick: () => actions.setStatus(occ, occ.status === "cancelled" ? "pending" : occ.status) },
                });
              },
            },
            {
              label: "Lần này và các lần sau",
              description: "Dừng lịch từ ngày này. Lịch sử hoàn thành trước đó được giữ lại.",
              onSelect: () =>
                void actions.taskAction
                  .mutateAsync({ taskId: task.id, action: "end", fromDate: occ.originalDate })
                  .then(() => toast.success("Đã dừng lịch từ " + formatDate(occ.originalDate)))
                  .catch(() => undefined),
            },
            { label: "Toàn bộ chuỗi, kể cả lịch sử", tone: "danger", onSelect: () => void deleteAll() },
          ],
        });
      },
      deleteTask: (task) => {
        const v = currentVersion(task, now.today);
        const recurring = task.versions.some((x) => x.recurrence.type !== "none");
        const completedCount = index.rowsByDate.filter((r) => r.taskId === task.id && r.status === "completed").length;
        const deleteAll = async () => {
          const ok = await confirm({
            title: `Xóa vĩnh viễn “${v.title}”?`,
            description:
              completedCount > 0
                ? `Toàn bộ lịch và ${completedCount} lần hoàn thành sẽ bị xóa. Không thể hoàn tác (trừ khi khôi phục từ bản sao lưu).`
                : "Công việc này sẽ bị xóa.",
            confirmLabel: "Xóa vĩnh viễn",
            tone: "danger",
          });
          if (ok) await actions.deleteTask.mutateAsync(task.id).then(() => toast.success("Đã xóa công việc")).catch(() => undefined);
        };
        if (!recurring || completedCount === 0) {
          void deleteAll();
          return;
        }
        setModal({
          type: "choice",
          title: `Xóa “${v.title}”`,
          choices: [
            {
              label: "Dừng từ hôm nay, giữ lịch sử",
              description: "Không còn lịch mới; số liệu và chuỗi ngày đã có vẫn được giữ.",
              onSelect: () =>
                void actions.taskAction
                  .mutateAsync({ taskId: task.id, action: "end", fromDate: now.today })
                  .then(() => toast.success("Đã dừng công việc từ hôm nay"))
                  .catch(() => undefined),
            },
            { label: "Xóa vĩnh viễn, kể cả lịch sử", tone: "danger", onSelect: () => void deleteAll() },
          ],
        });
      },
      pauseTask: (task) => {
        const v = currentVersion(task, now.today);
        void confirm({
          title: `Tạm dừng “${v.title}”?`,
          description: "Từ hôm nay sẽ không có lịch mới và những ngày tạm dừng không bị tính là bỏ lỡ. Bạn có thể tiếp tục bất cứ lúc nào.",
          confirmLabel: "Tạm dừng",
        }).then((ok) => {
          if (!ok) return;
          setModal(null);
          actions.taskAction
            .mutateAsync({ taskId: task.id, action: "pause", fromDate: now.today })
            .then(() => toast.success("Đã tạm dừng"))
            .catch(() => undefined);
        });
      },
      resumeTask: (task) => {
        actions.taskAction
          .mutateAsync({ taskId: task.id, action: "resume", fromDate: now.today < (task.pausedAt ?? now.today) ? task.pausedAt! : now.today })
          .then(() => toast.success("Đã tiếp tục thói quen"))
          .catch(() => undefined);
      },
    };
    return api;
  }, [actions, confirm, findTask, index, now.today]);

  return (
    <TaskUIContext.Provider value={ui}>
      {children}
      {modal?.type === "form" && <TaskFormDialog mode={modal.mode} onClose={close} />}
      {modal?.type === "occurrence" && <OccurrenceDialog occ={modal.occ} onClose={close} ui={ui} />}
      {modal?.type === "choice" && (
        <ChoiceDialog title={modal.title} description={modal.description} choices={modal.choices} onClose={close} />
      )}
    </TaskUIContext.Provider>
  );
}

export function ResumeButton({ task }: { task: Task }): ReactNode {
  const ui = useTaskUI();
  return (
    <Button variant="outline" size="sm" onClick={() => ui.resumeTask(task)}>
      <Play /> Tiếp tục
    </Button>
  );
}
