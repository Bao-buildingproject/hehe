"use client";

import { useEffect } from "react";
import { useEngine } from "@/lib/client/app-context";
import { isPushActiveHere, showLocalNotification } from "@/lib/client/notifications";
import { dueReminders } from "@/lib/domain/reminders";

const SENT_KEY = "mlp:sent-reminders";

function loadSent(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveSent(sent: Record<string, number>) {
  try {
    const cutoff = Date.now() - 3 * 86_400_000;
    const pruned = Object.fromEntries(Object.entries(sent).filter(([, t]) => t > cutoff));
    localStorage.setItem(SENT_KEY, JSON.stringify(pruned));
  } catch {
    // storage unavailable: worst case a reminder can repeat after reload
  }
}

/**
 * While the app is open, shows reminders as browser notifications. When Web Push
 * is active on this device the server sends them instead (no duplicates).
 */
export function ReminderScheduler() {
  const { index, now, snapshot } = useEngine();
  const prefs = snapshot.user.notificationPrefs;

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (cancelled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (await isPushActiveHere()) return;
      const sent = loadSent();
      const due = dueReminders(index, prefs, now, 10).filter((r) => !sent[r.key]);
      for (const r of due) {
        sent[r.key] = Date.now();
        await showLocalNotification(r.title, { body: r.body, tag: r.key, data: { url: r.url } });
      }
      if (due.length) saveSent(sent);
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [now, index, prefs]);

  return null;
}
