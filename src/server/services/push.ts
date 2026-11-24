import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import * as webpush from "web-push";
import { nowContext } from "@/lib/domain/dates";
import { createIndex } from "@/lib/domain/occurrences";
import { dueReminders } from "@/lib/domain/reminders";
import type { Db } from "../db";
import { notificationLog, pushSubscriptions } from "../db/schema";
import { logEvent } from "../log";
import { loadSnapshot } from "./snapshot";

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

export async function saveSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string,
) {
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) },
    });
}

export async function removeSubscription(db: Db, userId: string, endpoint: string) {
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

/**
 * Sends every reminder that became due in the last `windowMinutes` to the
 * users' devices. Each reminder key is recorded first, so overlapping runs
 * never send it twice.
 */
export async function runReminderCron(db: Db, windowMinutes = 10, instant = new Date()) {
  if (!pushConfigured()) return { users: 0, sent: 0, skipped: "push_not_configured" as const };
  ensureVapid();
  const subs = await db.select().from(pushSubscriptions);
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  let sent = 0;
  const dead: string[] = [];
  for (const [userId, userSubs] of byUser) {
    try {
      const snap = await loadSnapshot(db, userId);
      const now = nowContext(snap.user.timezone, instant);
      const reminders = dueReminders(createIndex(snap.tasks, snap.occurrences), snap.user.notificationPrefs, now, windowMinutes);
      for (const r of reminders) {
        const claimed = await db
          .insert(notificationLog)
          .values({ userId, key: r.key })
          .onConflictDoNothing()
          .returning({ key: notificationLog.key });
        if (!claimed.length) continue;
        const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url, tag: r.key });
        let delivered = false;
        let transientFailure = false;
        for (const s of userSubs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: 3600,
              urgency: "normal",
            });
            sent++;
            delivered = true;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) dead.push(s.id);
            else {
              transientFailure = true;
              logEvent("warn", "push_failed", { userId, status, message: error instanceof Error ? error.message : String(error) });
            }
          }
        }
        // Nothing reached the user because of a temporary error: release the claim so the next run retries.
        if (!delivered && transientFailure) {
          await db.delete(notificationLog).where(and(eq(notificationLog.userId, userId), eq(notificationLog.key, r.key)));
        }
      }
    } catch (error) {
      logEvent("error", "reminder_user_failed", { userId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  await db.delete(notificationLog).where(lt(notificationLog.sentAt, sql`now() - interval '8 days'`));
  return { users: byUser.size, sent, removed: dead.length };
}
