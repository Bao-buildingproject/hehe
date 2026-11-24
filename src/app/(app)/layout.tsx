import { type ReactNode, Suspense } from "react";
import { AppGate } from "@/components/app/app-gate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AppGate>{children}</AppGate>
    </Suspense>
  );
}
