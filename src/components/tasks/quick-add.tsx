"use client";

import { CornerDownLeft, LoaderCircle, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppActions, useEngine } from "@/lib/client/app-context";
import { type CategoryHint, parseQuickAdd } from "@/lib/domain/quick-add";
import type { TaskFields } from "@/lib/domain/types";
import { PRIORITY_LABEL, describeRule, formatDate } from "@/lib/domain/vi";
import { TASK_COLORS } from "@/lib/settings";
import { taskFieldsSchema } from "@/lib/validation";
import { useTaskUI } from "./task-ui";

const HINT_NAMES: Record<CategoryHint, string> = {
  study: "học tập",
  work: "công việc",
  health: "sức khỏe",
  personal: "cá nhân",
};

/** "Hôm nay bạn muốn làm gì?" — understands Vietnamese without any AI service, then asks to confirm. */
export function QuickAdd({ defaultDate }: { defaultDate?: string }) {
  const { now, snapshot } = useEngine();
  const actions = useAppActions();
  const ui = useTaskUI();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const draft = useMemo(() => (text.trim().length >= 2 ? parseQuickAdd(text, now.today) : null), [text, now.today]);
  const fields: TaskFields | null = useMemo(() => {
    if (!draft) return null;
    const category = draft.categoryHint
      ? snapshot.categories.find((c) => c.name.toLowerCase() === HINT_NAMES[draft.categoryHint!])
      : undefined;
    const usesDefaultDate = defaultDate && draft.date === now.today && !/(hôm nay|hom nay|hnay)/i.test(text);
    return {
      title: draft.title,
      description: "",
      categoryId: category?.id ?? null,
      priority: draft.priority,
      color: category?.color ?? TASK_COLORS[1],
      startTime: draft.startTime,
      endTime: draft.endTime,
      recurrence: draft.recurrence,
      startDate: usesDefaultDate ? defaultDate : draft.date,
      untilDate: draft.untilDate,
      weeklyTarget: draft.weeklyTarget,
    };
  }, [draft, snapshot.categories, defaultDate, now.today, text]);

  const category = fields?.categoryId ? snapshot.categories.find((c) => c.id === fields.categoryId) : null;

  async function save() {
    if (!fields || saving) return;
    const parsed = taskFieldsSchema.safeParse(fields);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Chưa đủ thông tin");
      return;
    }
    setSaving(true);
    try {
      await actions.createTask.mutateAsync(parsed.data);
      toast.success(`Đã thêm “${parsed.data.title}”`, { description: formatDate(parsed.data.startDate, "long") });
      setText("");
      inputRef.current?.focus();
    } catch {
      // toast shown by the mutation
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-1.5 shadow-soft transition-shadow focus-within:border-accent focus-within:shadow-card focus-within:ring-4 focus-within:ring-accent/10"
      >
        <Sparkles className="size-[18px] shrink-0 text-accent" aria-hidden />
        <label htmlFor="quick-add" className="sr-only">
          Nhập nhanh công việc
        </label>
        <input
          id="quick-add"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setText("");
          }}
          placeholder="Hôm nay bạn muốn làm gì?  Ví dụ: Học CFA 2 tiếng vào 19h tối mai"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
          autoComplete="off"
          maxLength={300}
        />
        {text && (
          <button type="button" onClick={() => setText("")} className="rounded-lg p-1.5 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Xóa nội dung">
            <X className="size-4" />
          </button>
        )}
      </form>

      <AnimatePresence>
        {draft && fields && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-line bg-surface p-4 shadow-pop"
            role="region"
            aria-label="Xem trước công việc"
            data-testid="quick-add-preview"
          >
            <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-fg-3">Xem trước — kiểm tra rồi lưu</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
              <dt className="text-fg-3">Công việc</dt>
              <dd className="font-medium text-fg" data-testid="qa-title">
                {fields.title || "—"}
              </dd>
              <dt className="text-fg-3">Ngày</dt>
              <dd data-testid="qa-date">{formatDate(fields.startDate, "long")}</dd>
              <dt className="text-fg-3">Giờ bắt đầu</dt>
              <dd data-testid="qa-start">{fields.startTime ?? "Không đặt giờ"}</dd>
              <dt className="text-fg-3">Giờ kết thúc</dt>
              <dd data-testid="qa-end">{fields.endTime ?? "—"}</dd>
              <dt className="text-fg-3">Lặp lại</dt>
              <dd>{describeRule(fields.recurrence)}</dd>
              {fields.weeklyTarget !== null && (
                <>
                  <dt className="text-fg-3">Mục tiêu</dt>
                  <dd>{fields.weeklyTarget} lần/tuần</dd>
                </>
              )}
              {category && (
                <>
                  <dt className="text-fg-3">Danh mục</dt>
                  <dd className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: category.color }} />
                    {category.name}
                  </dd>
                </>
              )}
              {fields.priority !== "medium" && (
                <>
                  <dt className="text-fg-3">Ưu tiên</dt>
                  <dd>{PRIORITY_LABEL[fields.priority]}</dd>
                </>
              )}
            </dl>
            {draft.notes.length > 0 && <p className="mt-2 text-[12px] text-danger-text">{draft.notes.join(" ")}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !fields.title} data-testid="qa-save">
                {saving ? <LoaderCircle className="animate-spin" /> : <CornerDownLeft />}
                Lưu
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  ui.openCreate(fields);
                  setText("");
                }}
              >
                <SlidersHorizontal /> Chỉnh sửa chi tiết
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setText("")}>
                Hủy
              </Button>
              <span className="ml-auto hidden text-[12px] text-fg-3 sm:block">Enter để lưu · Esc để hủy</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
