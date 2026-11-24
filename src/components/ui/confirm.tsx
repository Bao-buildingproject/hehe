"use client";

import { AlertDialog as A } from "radix-ui";
import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based confirmation dialog: `if (await confirm({...})) …`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <A.Root open={options !== null} onOpenChange={(open) => !open && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]" />
          <A.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-pop outline-none">
            <A.Title className="text-[16px] font-semibold text-fg">{options?.title}</A.Title>
            <A.Description asChild>
              <div className="mt-2 text-[14px] leading-relaxed text-fg-2">{options?.description ?? ""}</div>
            </A.Description>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <A.Cancel className={cn(buttonVariants({ variant: "secondary" }))}>{options?.cancelLabel ?? "Hủy"}</A.Cancel>
              <A.Action
                className={cn(buttonVariants({ variant: options?.tone === "danger" ? "danger" : "primary" }))}
                onClick={() => close(true)}
              >
                {options?.confirmLabel ?? "Đồng ý"}
              </A.Action>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside ConfirmProvider");
  return ctx;
}
