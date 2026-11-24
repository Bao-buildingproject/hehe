import { type ReactNode, Suspense } from "react";
import { AppGate } from "@/components/app/app-gate";

// The app loads each account's data in the browser (with a skeleton), so navigations
// into this segment are allowed to wait for it; skip instant-navigation validation.
export const instant = false;

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AppGate>{children}</AppGate>
    </Suspense>
  );
}
