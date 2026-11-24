"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChartColumn, ClipboardList, ListChecks, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api, errorMessage } from "@/lib/client/api";
import { useSnapshot } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export const NAV = [
  { href: "/calendar", label: "Lịch", icon: CalendarDays },
  { href: "/habits", label: "Thói quen", icon: ListChecks },
  { href: "/dashboard", label: "Thống kê", icon: ChartColumn },
  { href: "/tasks", label: "Công việc", icon: ClipboardList },
  { href: "/settings", label: "Cài đặt", icon: Settings },
] as const;

function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      // Never keep one account's data in memory for the next person on this device.
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

function UserMenu({ compact }: { compact?: boolean }) {
  const { user } = useSnapshot();
  const logout = useLogout();
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex min-w-0 items-center gap-2.5 rounded-xl text-left hover:bg-surface-2",
            compact ? "p-1" : "w-full p-2",
          )}
          aria-label="Tài khoản"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
            {initial}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{user.name || "Tài khoản"}</span>
              <span className="block truncate text-[12px] text-fg-3">{user.email}</span>
            </span>
          )}
        </button>
      </MenuTrigger>
      <MenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"}>
        <MenuLabel>{user.email}</MenuLabel>
        <MenuItem asChild>
          <Link href="/settings">
            <Settings /> Cài đặt
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={logout} tone="danger">
          <LogOut /> Đăng xuất
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-surface/70 px-3 py-4 backdrop-blur-xl lg:flex">
        <Link href="/calendar" className="px-2 py-1">
          <Logo />
        </Link>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Điều hướng chính">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors",
                active(href) ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-1 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <UserMenu />
          </div>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/calendar" className="flex items-center gap-2" aria-label="MY LIFE PLANNER">
          <LogoMark className="size-7" />
          <span className="text-[13px] font-bold tracking-[0.08em]">MY LIFE PLANNER</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu compact />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-4 sm:px-6 lg:pb-10 lg:pt-6">{children}</main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Điều hướng chính"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium",
                active(href) ? "text-accent" : "text-fg-3",
              )}
            >
              <Icon className="size-[22px]" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5", className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[14px] text-fg-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function LogoutButton() {
  const logout = useLogout();
  return (
    <Button variant="outline" onClick={logout}>
      <LogOut /> Đăng xuất
    </Button>
  );
}
