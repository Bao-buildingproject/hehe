"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const Icon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng/tối">
          <Icon />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-[170px]">
        {(
          [
            ["light", "Sáng", Sun],
            ["dark", "Tối", Moon],
            ["system", "Theo hệ thống", Monitor],
          ] as const
        ).map(([value, label, I]) => (
          <MenuItem key={value} onSelect={() => setTheme(value)} aria-checked={mounted && theme === value} role="menuitemradio">
            <I />
            <span className="flex-1">{label}</span>
            {mounted && theme === value ? <span className="size-1.5 rounded-full bg-accent" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
