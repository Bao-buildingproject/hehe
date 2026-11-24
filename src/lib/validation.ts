import { z } from "zod";
import { isValidDateStr, isValidTimeStr, isValidTimeZone, timeToMinutes } from "./domain/dates";
import { maxPerWeek } from "./domain/recurrence";

export const dateSchema = z.string().refine(isValidDateStr, "Ngày không hợp lệ");
export const timeSchema = z.string().refine(isValidTimeStr, "Giờ không hợp lệ (HH:MM)");
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu không hợp lệ");
const weekdaySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]);
const intervalSchema = z.number().int().min(1, "Chu kỳ tối thiểu là 1").max(99, "Chu kỳ tối đa là 99");

export const recurrenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("daily"), interval: intervalSchema }),
  z.object({
    type: z.literal("weekly"),
    interval: intervalSchema,
    weekdays: z
      .array(weekdaySchema)
      .min(1, "Chọn ít nhất một ngày trong tuần")
      .max(7)
      .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  }),
  z.object({
    type: z.literal("monthly"),
    interval: intervalSchema,
    monthly: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("dayOfMonth"), day: z.number().int().min(1).max(31) }),
      z.object({
        mode: z.literal("nthWeekday"),
        nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(-1)]),
        weekday: weekdaySchema,
      }),
    ]),
  }),
]);

export const prioritySchema = z.enum(["low", "medium", "high"]);

export const taskFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Vui lòng nhập tên công việc").max(200, "Tên tối đa 200 ký tự"),
    description: z.string().max(5000, "Mô tả tối đa 5000 ký tự").default(""),
    categoryId: z.uuid().nullable().default(null),
    priority: prioritySchema.default("medium"),
    color: colorSchema,
    startTime: timeSchema.nullable().default(null),
    endTime: timeSchema.nullable().default(null),
    recurrence: recurrenceSchema,
    startDate: dateSchema,
    untilDate: dateSchema.nullable().default(null),
    weeklyTarget: z.number().int().min(1).max(7).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.endTime && !v.startTime) {
      ctx.addIssue({ code: "custom", path: ["startTime"], message: "Nhập giờ bắt đầu trước khi chọn giờ kết thúc" });
    }
    if (v.startTime && v.endTime && timeToMinutes(v.endTime) <= timeToMinutes(v.startTime)) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Giờ kết thúc phải sau giờ bắt đầu" });
    }
    if (v.untilDate && v.untilDate < v.startDate) {
      ctx.addIssue({ code: "custom", path: ["untilDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" });
    }
    if (v.recurrence.type === "none") {
      if (v.weeklyTarget !== null) {
        ctx.addIssue({ code: "custom", path: ["weeklyTarget"], message: "Mục tiêu tuần chỉ dùng cho công việc lặp lại" });
      }
    } else if (v.weeklyTarget !== null && v.weeklyTarget > maxPerWeek(v.recurrence)) {
      ctx.addIssue({
        code: "custom",
        path: ["weeklyTarget"],
        message: `Lịch lặp lại này tối đa ${maxPerWeek(v.recurrence)} lần mỗi tuần`,
      });
    }
  });

export type TaskFieldsInput = z.input<typeof taskFieldsSchema>;

export const createTaskSchema = z.object({ fields: taskFieldsSchema });

export const editTaskSchema = z.discriminatedUnion("scope", [
  /** Only one occurrence (identified by its original date). */
  z.object({
    scope: z.literal("occurrence"),
    originalDate: dateSchema,
    date: dateSchema,
    overrides: z.object({
      title: z.string().trim().min(1).max(200).optional(),
      description: z.string().max(5000).optional(),
      startTime: timeSchema.nullable().optional(),
      endTime: timeSchema.nullable().optional(),
      priority: prioritySchema.optional(),
    }),
  }),
  /** This occurrence and every later one (or, from the task list, from today on). */
  z.object({ scope: z.literal("future"), fromDate: dateSchema, fields: taskFieldsSchema }),
  /** One-time tasks are edited in place. */
  z.object({ scope: z.literal("all"), fields: taskFieldsSchema }),
]);

export const occurrenceStatusSchema = z.enum(["pending", "in_progress", "completed", "skipped", "cancelled"]);

export const setOccurrenceSchema = z.object({
  originalDate: dateSchema,
  status: occurrenceStatusSchema,
});

export const pauseSchema = z.object({ fromDate: dateSchema });
export const resumeSchema = z.object({ fromDate: dateSchema });
export const endSeriesSchema = z.object({ fromDate: dateSchema });
export const reorderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(2000) });

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nhập tên danh mục").max(40, "Tên danh mục tối đa 40 ký tự"),
  color: colorSchema,
});

const reminderMinutes = z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]);
export const notificationPrefsSchema = z.object({
  beforeStart: z.object({ enabled: z.boolean(), minutes: reminderMinutes }),
  unfinished: z.object({ enabled: z.boolean(), time: timeSchema }),
  dailyReview: z.object({ enabled: z.boolean(), time: timeSchema }),
  weeklySummary: z.object({ enabled: z.boolean(), time: timeSchema }),
});

export const profileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  timezone: z
    .string()
    .refine((tz) => isValidTimeZone(tz), "Múi giờ không hợp lệ")
    .optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
});

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email quá dài")
  .pipe(z.email("Email không hợp lệ"));

export const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .max(200, "Mật khẩu tối đa 200 ký tự");

export const signupSchema = z.object({
  name: z.string().trim().max(80).default(""),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Nhập mật khẩu").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

/** First validation message, for toasts and API errors. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ";
}
