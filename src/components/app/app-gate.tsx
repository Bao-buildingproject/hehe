"use client";

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { TaskUIProvider } from "@/components/tasks/task-ui";
import { Button } from "@/components/ui/button";
import { ConfirmProvider } from "@/components/ui/confirm";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/client/api";
import { AppDataProvider } from "@/lib/client/app-context";
import { useSnapshotQuery } from "@/lib/client/store";
import { AppShell } from "./app-shell";
import { LogoMark } from "./logo";
import { ReminderScheduler } from "./reminder-scheduler";

function LoadingScreen() {
  return (
    <div className="min-h-dvh lg:pl-[248px]" aria-busy="true" aria-label="Đang tải dữ liệu">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col gap-3 border-r border-line bg-surface/70 p-4 lg:flex">
        <LogoMark />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </aside>
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-12" />
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-40 md:h-[360px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Loads the user's data once, then renders the app with shared state. */
export function AppGate({ children }: { children: ReactNode }) {
  const query = useSnapshotQuery();
  if (query.isPending) return <LoadingScreen />;
  if (query.isError) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="max-w-sm text-center">
          <LogoMark className="mx-auto mb-4" />
          <p className="text-[16px] font-semibold">Không tải được dữ liệu</p>
          <p className="mt-1 text-[14px] text-fg-3">{errorMessage(query.error)}</p>
          <Button variant="primary" className="mt-4" onClick={() => void query.refetch()}>
            <RotateCcw /> Thử lại
          </Button>
        </div>
      </div>
    );
  }
  return (
    <AppDataProvider>
      <ConfirmProvider>
        <TaskUIProvider>
          <AppShell>{children}</AppShell>
          <ReminderScheduler />
        </TaskUIProvider>
      </ConfirmProvider>
    </AppDataProvider>
  );
}
