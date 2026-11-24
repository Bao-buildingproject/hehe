"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

interface ContentProps extends Omit<ComponentProps<typeof D.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideClose?: boolean;
}

/** Centered dialog on desktop, bottom sheet on phones. */
export function DialogContent({ title, description, footer, children, className, size = "md", hideClose, ...props }: ContentProps) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-pop outline-none",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:max-h-[84vh] sm:w-full sm:-translate-x-1/2 sm:rounded-2xl",
          size === "sm" && "sm:max-w-md",
          size === "md" && "sm:max-w-lg",
          size === "lg" && "sm:max-w-2xl",
          "data-[state=open]:animate-[sheet-in_220ms_cubic-bezier(0.2,0.8,0.2,1)] sm:data-[state=open]:animate-[pop-in_160ms_ease-out]",
          className,
        )}
        {...props}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3 sm:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <D.Title className="text-[17px] font-semibold tracking-tight text-fg">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Hộp thoại"}</D.Description>
            )}
          </div>
          {!hideClose && (
            <D.Close className="-mr-2 -mt-1 rounded-lg p-2 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Đóng">
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">{children}</div>
        {footer ? (
          <div className="safe-bottom flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </D.Content>
    </D.Portal>
  );
}
