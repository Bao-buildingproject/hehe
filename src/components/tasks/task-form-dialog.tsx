"use client";

import { LoaderCircle, Plus, Repeat } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { errorMessage } from "@/lib/client/api";
import { type DateStr, type Weekday, minDate } from "@/lib/domain/dates";
import { currentVersion } from "@/lib/domain/occurrences";
import { maxPerWeek, previewDates } from "@/lib/domain/recurrence";
import { fieldsOf } from "@/lib/domain/split";
import type { Occurrence, Priority, Task, TaskFields } from "@/lib/domain/types";
import { PRIORITY_LABEL, WEEKDAY_SHORT, describeSchedule, formatDate } from "@/lib/domain/vi";
import { TASK_COLORS } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { taskFieldsSchema } from "@/lib/validation";
import { type RepeatPreset, PRESET_LABEL, fromRecurrence, toRecurrence } from "./recurrence-form";

export type FormMode =
  | { kind: "create"; prefill?: Partial<TaskFields> }
  | { kind: "series"; task: Task }
  | { kind: "future"; task: Task; occ: Occurrence }
  | { kind: "occurrence"; task: Task; occ: Occurrence };

const NEW_CATEGORY = "__new__";
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function initialFields(mode: FormMode, today: DateStr): TaskFields {
  if (mode.kind === "create") {
    return {
      title: "",
      description: "",
      categoryId: null,
      priority: "medium",
      color: TASK_COLORS[1],
      startTime: null,
      endTime: null,
      recurrence: { type: "none" },
      startDate: today,
      untilDate: null,
      weeklyTarget: null,
      ...mode.prefill,
    };
  }
  if (mode.kind === "series") return fieldsOf(currentVersion(mode.task, today));
  const v = mode.task.versions.find((x) => x.id === mode.occ.versionId) ?? currentVersion(mode.task, today);
  if (mode.kind === "future") return { ...fieldsOf(v), startDate: mode.occ.originalDate };
  return {
    ...fieldsOf(v),
    title: mode.occ.title,
    description: mode.occ.description,
    startDate: mode.occ.date,
    startTime: mode.occ.startTime,
    endTime: mode.occ.endTime,
    priority: mode.occ.priority,
  };
}

export function TaskFormDialog({ mode, onClose }: { mode: FormMode; onClose: () => void }) {
  const { now, snapshot } = useEngine();
  const actions = useAppActions();
  const today = now.today;
  const [initial] = useState(() => initialFields(mode, today));
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [startDate, setStartDate] = useState<DateStr>(initial.startDate);
  const [startTime, setStartTime] = useState(initial.startTime ?? "");
  const [endTime, setEndTime] = useState(initial.endTime ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial.categoryId ?? "");
  const [priority, setPriority] = useState<Priority>(initial.priority);
  const [color, setColor] = useState(initial.color);
  const [colorTouched, setColorTouched] = useState(mode.kind !== "create" || Boolean(mode.prefill?.color));
  const [repeat, setRepeat] = useState(() => fromRecurrence(initial.recurrence, initial.startDate));
  const [untilDate, setUntilDate] = useState(initial.untilDate ?? "");
  const [target, setTarget] = useState(initial.weeklyTarget ? String(initial.weeklyTarget) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newCat, setNewCat] = useState<{ name: string; color: string } | null>(null);

  const onlyOccurrence = mode.kind === "occurrence";
  const recurrence = useMemo(() => toRecurrence(repeat, startDate), [repeat, startDate]);
  const recurring = recurrence.type !== "none";
  const maxTarget = maxPerWeek(recurrence);

  const fields: TaskFields = {
    title: title.trim(),
    description,
    categoryId: categoryId || null,
    priority,
    color,
    startTime: startTime || null,
    endTime: endTime || null,
    recurrence,
    startDate,
    untilDate: recurring && untilDate ? untilDate : null,
    weeklyTarget: recurring && target ? Number(target) : null,
  };

  const preview = useMemo(
    () => (recurring ? previewDates({ recurrence, startDate, untilDate: untilDate || null }, startDate, 6) : []),
    [recurring, recurrence, startDate, untilDate],
  );

  const title_ =
    mode.kind === "create"
      ? "Thêm công việc mới"
      : mode.kind === "occurrence"
        ? `Sửa lần ${formatDate(mode.occ.originalDate, "short")}`
        : mode.kind === "future"
          ? "Sửa lần này và các lần sau"
          : "Sửa công việc";

  const scopeNote =
    mode.kind === "future"
      ? `Thay đổi áp dụng từ ${formatDate(minDate(mode.occ.originalDate, startDate))} trở đi. Các lần trước và lịch sử hoàn thành được giữ nguyên.`
      : mode.kind === "series" && mode.task.versions.some((v) => v.recurrence.type !== "none")
        ? `Thay đổi áp dụng từ hôm nay (${formatDate(today)}) trở đi. Lịch sử trước đó được giữ nguyên.`
        : mode.kind === "occurrence"
          ? "Chỉ thay đổi lần này. Danh mục, màu và lịch lặp lại vẫn theo cả chuỗi."
          : null;

  async function submit() {
    if (saving) return;
    const parsed = taskFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (mode.kind === "create") {
        await actions.createTask.mutateAsync(parsed.data);
        toast.success("Đã thêm công việc", { description: describeSchedule(parsed.data) });
      } else if (mode.kind === "occurrence") {
        await actions.editTask.mutateAsync({
          taskId: mode.task.id,
          body: {
            scope: "occurrence",
            originalDate: mode.occ.originalDate,
            date: startDate,
            overrides: {
              title: parsed.data.title,
              description: parsed.data.description,
              startTime: parsed.data.startTime,
              endTime: parsed.data.endTime,
              priority: parsed.data.priority,
            },
          },
        });
        toast.success("Đã lưu thay đổi cho lần này");
      } else if (mode.kind === "future") {
        await actions.editTask.mutateAsync({
          taskId: mode.task.id,
          body: { scope: "future", fromDate: minDate(mode.occ.originalDate, startDate), fields: parsed.data },
        });
        toast.success("Đã cập nhật các lần sau");
      } else {
        const oneTime = mode.task.versions.length === 1 && mode.task.versions[0]!.recurrence.type === "none";
        const anchor = currentVersion(mode.task, today).startDate;
        const fromDate = startDate !== anchor && startDate < today ? startDate : today;
        await actions.editTask.mutateAsync({
          taskId: mode.task.id,
          body: oneTime ? { scope: "all", fields: parsed.data } : { scope: "future", fromDate, fields: parsed.data },
        });
        toast.success("Đã lưu công việc");
      }
      onClose();
    } catch {
      // The mutation already shows the error.
    } finally {
      setSaving(false);
    }
  }

  async function createCategory() {
    if (!newCat?.name.trim()) return;
    try {
      const { category } = await actions.saveCategory.mutateAsync({ name: newCat.name.trim(), color: newCat.color });
      setCategoryId(category.id);
      if (!colorTouched) setColor(category.color);
      setNewCat(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const presetOptions: RepeatPreset[] = ["none", "daily", "specific", "weekly", "monthly", "custom"];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={title_}
        description={scopeNote ?? undefined}
        size="lg"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving} data-testid="task-form-save">
              {saving ? <LoaderCircle className="animate-spin" /> : null}
              {mode.kind === "create" ? "Thêm công việc" : "Lưu"}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="Tên công việc" error={errors.title}>
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                aria-invalid={!!errors.title}
                autoFocus
                maxLength={200}
                placeholder="Ví dụ: Học CFA Level I"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>

          <Field label="Mô tả (không bắt buộc)" error={errors.description}>
            {(id, d) => (
              <Textarea
                id={id}
                aria-describedby={d}
                rows={2}
                maxLength={5000}
                placeholder="Ghi chú chi tiết…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={recurring && !onlyOccurrence ? "Ngày bắt đầu" : "Ngày thực hiện"} error={errors.startDate} className="col-span-2 sm:col-span-1">
              {(id, d) => (
                <Input
                  id={id}
                  type="date"
                  aria-describedby={d}
                  value={startDate}
                  required
                  onChange={(e) => e.target.value && setStartDate(e.target.value)}
                />
              )}
            </Field>
            <Field label="Giờ bắt đầu" error={errors.startTime}>
              {(id, d) => (
                <Input id={id} type="time" aria-describedby={d} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              )}
            </Field>
            <Field label="Giờ kết thúc" error={errors.endTime}>
              {(id, d) => (
                <Input
                  id={id}
                  type="time"
                  aria-describedby={d}
                  aria-invalid={!!errors.endTime}
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              )}
            </Field>
          </div>
          {(startTime || endTime) && (
            <button
              type="button"
              className="-mt-2 self-start text-[12px] text-fg-3 underline-offset-2 hover:text-fg hover:underline"
              onClick={() => {
                setStartTime("");
                setEndTime("");
              }}
            >
              Bỏ giờ (cả ngày)
            </button>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {!onlyOccurrence && (
              <Field label="Danh mục">
                {(id) => (
                  <Select
                    id={id}
                    value={categoryId}
                    onChange={(e) => {
                      if (e.target.value === NEW_CATEGORY) {
                        setNewCat({ name: "", color: TASK_COLORS[snapshot.categories.length % TASK_COLORS.length]! });
                        return;
                      }
                      setCategoryId(e.target.value);
                      const cat = snapshot.categories.find((c) => c.id === e.target.value);
                      if (cat && !colorTouched) setColor(cat.color);
                    }}
                  >
                    <option value="">Không có danh mục</option>
                    {snapshot.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    <option value={NEW_CATEGORY}>+ Tạo danh mục mới…</option>
                  </Select>
                )}
              </Field>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg-2">Mức độ ưu tiên</span>
              <Segmented
                label="Mức độ ưu tiên"
                value={priority}
                onChange={setPriority}
                className="self-start"
                options={(["low", "medium", "high"] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
              />
            </div>
          </div>

          {newCat && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2 p-3">
              <Field label="Tên danh mục mới" className="min-w-[160px] flex-1">
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    maxLength={40}
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void createCategory();
                      }
                    }}
                  />
                )}
              </Field>
              <input
                type="color"
                aria-label="Màu danh mục"
                value={newCat.color}
                onChange={(e) => setNewCat({ ...newCat, color: e.target.value })}
                className="h-10 w-12 cursor-pointer rounded-lg border border-line-strong bg-surface"
              />
              <Button variant="primary" onClick={() => void createCategory()} disabled={!newCat.name.trim()}>
                <Plus /> Tạo
              </Button>
              <Button variant="ghost" onClick={() => setNewCat(null)}>
                Hủy
              </Button>
            </div>
          )}

          {!onlyOccurrence && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg-2">Màu sắc</span>
              <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Màu sắc">
                {TASK_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color.toLowerCase() === c}
                    aria-label={`Màu ${c}`}
                    onClick={() => {
                      setColor(c);
                      setColorTouched(true);
                    }}
                    className={cn(
                      "size-7 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110",
                      color.toLowerCase() === c && "ring-2 ring-fg/70",
                    )}
                    style={{ background: c }}
                  />
                ))}
                <label className="relative grid size-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-fg-3 hover:text-fg" title="Màu tùy chọn">
                  <Plus className="size-3.5" />
                  <input
                    type="color"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Chọn màu tùy chọn"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      setColorTouched(true);
                    }}
                  />
                </label>
              </div>
            </div>
          )}

          {!onlyOccurrence && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/60 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lặp lại" error={errors.recurrence}>
                  {(id) => (
                    <Select
                      id={id}
                      value={repeat.preset}
                      onChange={(e) => setRepeat({ ...repeat, preset: e.target.value as RepeatPreset })}
                    >
                      {presetOptions.map((p) => (
                        <option key={p} value={p}>
                          {PRESET_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {recurring && (
                  <Field label="Ngày kết thúc (không bắt buộc)" error={errors.untilDate}>
                    {(id, d) => (
                      <Input
                        id={id}
                        type="date"
                        aria-describedby={d}
                        min={startDate}
                        value={untilDate}
                        onChange={(e) => setUntilDate(e.target.value)}
                      />
                    )}
                  </Field>
                )}
              </div>

              {repeat.preset === "custom" && (
                <div className="flex flex-wrap items-center gap-2 text-[14px] text-fg-2">
                  <span>Mỗi</span>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    aria-label="Chu kỳ"
                    className="h-9 w-20"
                    value={repeat.interval}
                    onChange={(e) => setRepeat({ ...repeat, interval: Number(e.target.value) })}
                  />
                  <Select
                    aria-label="Đơn vị chu kỳ"
                    className="h-9 w-auto"
                    value={repeat.unit}
                    onChange={(e) => setRepeat({ ...repeat, unit: e.target.value as typeof repeat.unit })}
                  >
                    <option value="day">ngày</option>
                    <option value="week">tuần</option>
                    <option value="month">tháng</option>
                  </Select>
                </div>
              )}

              {(repeat.preset === "specific" || (repeat.preset === "custom" && repeat.unit === "week")) && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-medium text-fg-2">Vào các ngày</span>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn ngày trong tuần">
                    {WEEKDAYS.map((d) => {
                      const on = repeat.weekdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setRepeat({
                              ...repeat,
                              weekdays: on ? repeat.weekdays.filter((x) => x !== d) : [...repeat.weekdays, d].sort((a, b) => a - b),
                            })
                          }
                          className={cn(
                            "h-9 min-w-10 rounded-xl px-2 text-[13px] font-semibold transition-colors",
                            on ? "bg-accent text-accent-fg" : "bg-surface text-fg-2 ring-1 ring-line-strong hover:bg-surface-3",
                          )}
                        >
                          {WEEKDAY_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 text-[12px] text-fg-3">
                    <button type="button" className="hover:text-fg" onClick={() => setRepeat({ ...repeat, weekdays: [1, 2, 3, 4, 5] })}>
                      T2 → T6
                    </button>
                    <button type="button" className="hover:text-fg" onClick={() => setRepeat({ ...repeat, weekdays: [6, 7] })}>
                      Cuối tuần
                    </button>
                    <button type="button" className="hover:text-fg" onClick={() => setRepeat({ ...repeat, weekdays: [...WEEKDAYS] })}>
                      Cả tuần
                    </button>
                  </div>
                </div>
              )}

              {(repeat.preset === "monthly" || (repeat.preset === "custom" && repeat.unit === "month")) && (
                <Segmented
                  label="Cách lặp hằng tháng"
                  value={repeat.monthlyMode}
                  onChange={(v) => setRepeat({ ...repeat, monthlyMode: v })}
                  className="self-start"
                  options={[
                    { value: "dayOfMonth", label: "Theo ngày trong tháng" },
                    { value: "nthWeekday", label: "Theo thứ trong tuần" },
                  ]}
                />
              )}

              {recurring && (
                <Field
                  label="Mục tiêu (số lần mỗi tuần)"
                  error={errors.weeklyTarget}
                  hint={`Không bắt buộc. Lịch này tối đa ${maxTarget} lần/tuần; để trống = hoàn thành mọi lần đã lên lịch.`}
                >
                  {(id, d) => (
                    <Input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={maxTarget}
                      aria-describedby={d}
                      aria-invalid={!!errors.weeklyTarget}
                      placeholder={`1 – ${maxTarget}`}
                      className="w-32"
                      value={target}
                      onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, "").slice(0, 1))}
                    />
                  )}
                </Field>
              )}

              <div className="flex items-start gap-2 rounded-xl bg-surface p-3 text-[13px] text-fg-2 ring-1 ring-line">
                <Repeat className="mt-0.5 size-4 shrink-0 text-fg-3" />
                <div className="min-w-0">
                  <p className="font-medium text-fg">{describeSchedule({ recurrence, startDate, untilDate: untilDate || null })}</p>
                  {recurring && preview.length > 0 && (
                    <p className="mt-1 text-fg-3">
                      Các lần tới: {preview.map((d) => formatDate(d, "short")).join(" · ")}
                    </p>
                  )}
                  {recurring && preview.length === 0 && <p className="mt-1 text-danger-text">Lịch này không có lần nào.</p>}
                </div>
              </div>
            </div>
          )}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
