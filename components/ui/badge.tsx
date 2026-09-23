import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 transition-colors [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-white",
        secondary: "bg-fog text-ink",
        outline: "border border-border bg-background text-ink",
        success: "bg-green-soft text-green-ink",
        warning: "bg-orange-soft text-orange-ink",
        destructive: "bg-destructive/10 text-destructive",
        yellow: "bg-yellow text-ink",
        magenta: "bg-magenta-soft text-magenta-ink",
        purple: "bg-purple-soft text-purple-ink",
        indigo: "bg-indigo-soft text-indigo-ink",
        blue: "bg-blue-soft text-blue-ink",
        sky: "bg-sky-soft text-sky-ink",
        lavender: "bg-lavender-soft text-lavender-ink",
        green: "bg-green-soft text-green-ink",
        orange: "bg-orange-soft text-orange-ink",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** A small leading dot in the badge's text colour; `pulse` makes it breathe, for anything live. */
  dot?: boolean | "pulse";
}

/** Inline by nature, so a span: it sits inside headings, paragraphs and table text without breaking HTML nesting. */
const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, dot, children, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props}>
    {dot ? (
      <span aria-hidden className="relative flex h-1.5 w-1.5">
        {dot === "pulse" ? <span className="absolute inline-flex h-full w-full animate-ping-soft rounded-full bg-current motion-reduce:animate-none" /> : null}
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
    ) : null}
    {children}
  </span>
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
