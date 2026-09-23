import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Pill shaped, as on the marketing site. A slight press on click; colour
  // transitions only, so the UI still feels quick at app density.
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-white hover:bg-ink/85",
        /** The one action a page wants you to take next, in the site's yellow. */
        highlight: "bg-yellow text-ink hover:bg-yellow/80",
        secondary: "bg-fog text-ink hover:bg-[hsl(0_0%_92%)]",
        outline: "border border-input bg-background text-ink hover:border-ink/40 hover:bg-fog/60",
        ghost: "text-ink hover:bg-fog",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "rounded-md text-ink underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 [&_svg]:size-4",
        sm: "h-8 px-3.5 text-[13px] [&_svg]:size-3.5",
        lg: "h-11 px-6 text-[15px] [&_svg]:size-4",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a <button> (Radix Slot). */
  asChild?: boolean;
  /** Shows a spinner and disables the button; keeps the label so layout doesn't jump. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Slot needs a single child, so only decorate when rendering a real button. */}
        {asChild ? (
          children
        ) : (
          <>
            {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
