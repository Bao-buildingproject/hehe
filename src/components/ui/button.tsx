import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import { type ComponentProps, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg shadow-soft hover:bg-accent-hover",
        secondary: "bg-surface-2 text-fg hover:bg-surface-3",
        outline: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
        danger: "bg-st-overdue text-white hover:opacity-90",
        "danger-ghost": "text-danger-text hover:bg-st-overdue-soft",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9 rounded-lg",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
