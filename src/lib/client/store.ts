"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { type NowContext, nowContext } from "@/lib/domain/dates";
import { type EngineIndex, createIndex } from "@/lib/domain/occurrences";
import type { Category, Occurrence, OccurrenceRow, OccurrenceStatus, Task, TaskFields } from "@/lib/domain/types";
import type { NotificationPrefs } from "@/lib/settings";
import type { Snapshot, SnapshotUser } from "@/server/services/snapshot";
import type { TaskBundle } from "@/server/services/tasks";
import { api, errorMessage } from "./api";

export type { Snapshot, SnapshotUser, TaskBundle };

export const SNAPSHOT_KEY = ["snapshot"] as const;

export function useSnapshotQuery() {
  return useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: ({ signal }) => api<Snapshot>("/api/snapshot", { signal }),
  });
}

/** Snapshot that is guaranteed to be loaded (the app layout waits for it). */
export function useSnapshot(): Snapshot {
  const { data } = useSnapshotQuery();
  if (!data) throw new Error("Snapshot is not loaded yet");
  return data;
}

/** Current date/time in the user's timezone, refreshed every 20 seconds. */
export function useNow(timeZone: string): NowContext {
  const [now, setNow] = useState(() => nowContext(timeZone));
  useEffect(() => {
    const tick = () =>
      setNow((prev) => {
        const next = nowContext(timeZone);
        return next.today === prev.today && next.minutes === prev.minutes ? prev : next;
      });
    tick();
    const id = window.setInterval(tick, 20_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timeZone]);
  return now;
}

export interface Engine {
  snapshot: Snapshot;
  index: EngineIndex;
  now: NowContext;
  categoriesById: Map<string, Category>;
}

/** Computes the engine once per snapshot; read it through `useEngine()` from app-context. */
export function useComputeEngine(): Engine {
  const snapshot = useSnapshot();
  const now = useNow(snapshot.user.timezone);
  const index = useMemo(() => createIndex(snapshot.tasks, snapshot.occurrences), [snapshot.tasks, snapshot.occurrences]);
  const categoriesById = useMemo(() => new Map(snapshot.categories.map((c) => [c.id, c])), [snapshot.categories]);
  return { snapshot, index, now, categoriesById };
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function mergeBundle(s: Snapshot, b: TaskBundle): Snapshot {
  const tasks = b.task
    ? s.tasks.some((t) => t.id === b.taskId)
      ? s.tasks.map((t) => (t.id === b.taskId ? b.task! : t))
      : [...s.tasks, b.task]
    : s.tasks.filter((t) => t.id !== b.taskId);
  const occurrences = [...s.occurrences.filter((o) => o.taskId !== b.taskId), ...b.occurrences];
  return { ...s, tasks, occurrences };
}

function upsertRow(s: Snapshot, row: OccurrenceRow): Snapshot {
  const exists = s.occurrences.some((o) => o.taskId === row.taskId && o.originalDate === row.originalDate);
  return {
    ...s,
    occurrences: exists
      ? s.occurrences.map((o) => (o.taskId === row.taskId && o.originalDate === row.originalDate ? row : o))
      : [...s.occurrences, row],
  };
}

const requestChains = new Map<string, { promise: Promise<unknown>; seq: number }>();

/** Runs requests for the same key one after another, so the last click always wins on the server too. */
function enqueue<T>(key: string, fn: () => Promise<T>): { promise: Promise<T>; seq: number } {
  const prev = requestChains.get(key);
  const seq = (prev?.seq ?? 0) + 1;
  const promise = (prev?.promise ?? Promise.resolve()).catch(() => undefined).then(fn);
  requestChains.set(key, { promise, seq });
  void promise.finally(() => {
    if (requestChains.get(key)?.seq === seq) requestChains.delete(key);
  }).catch(() => undefined);
  return { promise, seq };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useActions() {
  const qc = useQueryClient();
  const update = useCallback(
    (fn: (s: Snapshot) => Snapshot) => qc.setQueryData<Snapshot>(SNAPSHOT_KEY, (s) => (s ? fn(s) : s)),
    [qc],
  );
  const resync = useCallback(() => qc.invalidateQueries({ queryKey: SNAPSHOT_KEY }), [qc]);
  const fail = useCallback(
    (error: unknown) => {
      toast.error(errorMessage(error));
      void resync();
    },
    [resync],
  );

  /** Tick / untick / skip / cancel — applied instantly, then saved. */
  const setStatus = useCallback(
    (occ: Pick<Occurrence, "taskId" | "originalDate" | "date" | "versionId">, status: OccurrenceStatus) => {
      const key = `${occ.taskId}:${occ.originalDate}`;
      const nowIso = new Date().toISOString();
      update((s) => {
        const existing = s.occurrences.find((o) => o.taskId === occ.taskId && o.originalDate === occ.originalDate);
        const row: OccurrenceRow = existing
          ? {
              ...existing,
              status,
              completedAt: status === "completed" ? (existing.completedAt ?? nowIso) : null,
              updatedAt: nowIso,
            }
          : {
              id: `pending-${key}`,
              taskId: occ.taskId,
              versionId: occ.versionId,
              originalDate: occ.originalDate,
              date: occ.date,
              status,
              completedAt: status === "completed" ? nowIso : null,
              overrides: {},
              createdAt: nowIso,
              updatedAt: nowIso,
            };
        return upsertRow(s, row);
      });
      const { promise, seq } = enqueue(key, () =>
        api<{ occurrence: OccurrenceRow }>(`/api/tasks/${occ.taskId}/occurrences`, {
          method: "PUT",
          body: { originalDate: occ.originalDate, status },
        }),
      );
      promise
        .then(({ occurrence }) => {
          if (requestChains.get(key)?.seq === seq || !requestChains.has(key)) update((s) => upsertRow(s, occurrence));
        })
        .catch(fail);
    },
    [update, fail],
  );

  const toggle = useCallback(
    (occ: Occurrence) => setStatus(occ, occ.status === "completed" ? "pending" : "completed"),
    [setStatus],
  );

  const createTask = useMutation({
    mutationFn: (fields: TaskFields) => api<TaskBundle>("/api/tasks", { method: "POST", body: { fields } }),
    onSuccess: (bundle) => update((s) => mergeBundle(s, bundle)),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const editTask = useMutation({
    mutationFn: (v: { taskId: string; body: unknown }) => api<TaskBundle>(`/api/tasks/${v.taskId}`, { method: "PATCH", body: v.body }),
    onSuccess: (bundle) => update((s) => mergeBundle(s, bundle)),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const taskAction = useMutation({
    mutationFn: (v: { taskId: string; action: "pause" | "resume" | "end"; fromDate: string }) =>
      api<TaskBundle>(`/api/tasks/${v.taskId}/${v.action}`, { method: "POST", body: { fromDate: v.fromDate } }),
    onSuccess: (bundle) => update((s) => mergeBundle(s, bundle)),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onMutate: (taskId) => {
      const prev = qc.getQueryData<Snapshot>(SNAPSHOT_KEY);
      update((s) => ({
        ...s,
        tasks: s.tasks.filter((t) => t.id !== taskId),
        occurrences: s.occurrences.filter((o) => o.taskId !== taskId),
      }));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(SNAPSHOT_KEY, ctx.prev);
      toast.error(errorMessage(e));
    },
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => api("/api/tasks/reorder", { method: "PUT", body: { ids } }),
    onMutate: (ids) => {
      update((s) => {
        const pos = new Map(ids.map((id, i) => [id, i + 1]));
        return { ...s, tasks: s.tasks.map((t: Task) => (pos.has(t.id) ? { ...t, position: pos.get(t.id)! } : t)) };
      });
    },
    onError: fail,
  });

  const saveCategory = useMutation({
    mutationFn: (v: { id?: string; name: string; color: string }) =>
      v.id
        ? api<{ category: Category }>(`/api/categories/${v.id}`, { method: "PATCH", body: { name: v.name, color: v.color } })
        : api<{ category: Category }>("/api/categories", { method: "POST", body: { name: v.name, color: v.color } }),
    onSuccess: ({ category }) =>
      update((s) => ({
        ...s,
        categories: s.categories.some((c) => c.id === category.id)
          ? s.categories.map((c) => (c.id === category.id ? category : c))
          : [...s.categories, category],
      })),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api(`/api/categories/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) =>
      update((s) => ({
        ...s,
        categories: s.categories.filter((c) => c.id !== id),
        tasks: s.tasks.map((t) => ({
          ...t,
          versions: t.versions.map((v) => (v.categoryId === id ? { ...v, categoryId: null } : v)),
        })),
      })),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const updateProfile = useMutation({
    mutationFn: (body: { name?: string; timezone?: string; notificationPrefs?: NotificationPrefs }) =>
      api<{ user: SnapshotUser }>("/api/profile", { method: "PATCH", body }),
    onSuccess: ({ user }) => update((s) => ({ ...s, user })),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return {
    setStatus,
    toggle,
    createTask,
    editTask,
    taskAction,
    deleteTask,
    reorder,
    saveCategory,
    deleteCategory,
    updateProfile,
    resync,
  };
}
