import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { OccurrenceOverrides, Recurrence } from "@/lib/domain/types";
import type { NotificationPrefs } from "@/lib/settings";

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    timezone: text("timezone").notNull().default("Asia/Ho_Chi_Minh"),
    notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the random token stored in the cookie (the token itself is never stored). */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    position: doublePrecision("position").notNull().default(0),
    pausedAt: date("paused_at", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_user_idx").on(t.userId)],
);

export const taskVersions = pgTable(
  "task_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    priority: text("priority").$type<"low" | "medium" | "high">().notNull().default("medium"),
    color: text("color").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    recurrence: jsonb("recurrence").$type<Recurrence>().notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    untilDate: date("until_date", { mode: "string" }),
    weeklyTarget: integer("weekly_target"),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("task_versions_task_idx").on(t.taskId),
    index("task_versions_user_idx").on(t.userId),
    check("task_versions_priority_check", sql`${t.priority} in ('low', 'medium', 'high')`),
    check("task_versions_time_check", sql`${t.startTime} is null or ${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("task_versions_end_time_check", sql`${t.endTime} is null or ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("task_versions_target_check", sql`${t.weeklyTarget} is null or (${t.weeklyTarget} between 1 and 7)`),
  ],
);

export const taskOccurrences = pgTable(
  "task_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => taskVersions.id, { onDelete: "set null" }),
    originalDate: date("original_date", { mode: "string" }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    status: text("status")
      .$type<"pending" | "in_progress" | "completed" | "skipped" | "cancelled">()
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    overrides: jsonb("overrides").$type<OccurrenceOverrides>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One row per occurrence: the reason a task can never be counted twice.
    uniqueIndex("task_occurrences_task_date_key").on(t.taskId, t.originalDate),
    index("task_occurrences_user_date_idx").on(t.userId, t.date),
    check(
      "task_occurrences_status_check",
      sql`${t.status} in ('pending', 'in_progress', 'completed', 'skipped', 'cancelled')`,
    ),
    check(
      "task_occurrences_completed_at_check",
      sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`,
    ),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)],
);

/** Prevents sending the same reminder twice when scheduler runs overlap. */
export const notificationLog = pgTable(
  "notification_log",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const backups = pgTable(
  "backups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    data: jsonb("data").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("backups_user_idx").on(t.userId, t.createdAt)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
});
