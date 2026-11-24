import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <rect x="7" y="9" width="18" height="16" rx="3.5" fill="none" stroke="white" strokeWidth="2" />
      <path d="M7 13.5h18" stroke="white" strokeWidth="2" />
      <path d="M12 7v4M20 7v4" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="m12.2 19.2 2.4 2.4 5-5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-[0.08em] text-fg">MY LIFE PLANNER</div>
          <div className="text-[11px] text-fg-3">Smart Calendar & Habit Tracker</div>
        </div>
      )}
    </div>
  );
}
