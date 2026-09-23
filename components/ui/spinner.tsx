import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-3.5 w-3.5",
  default: "h-5 w-5",
  lg: "h-8 w-8",
} as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: keyof typeof sizes;
}

/**
 * The rotation lives on the icon and any positioning on the wrapper: a
 * `translate` class on the spinning element itself would be overwritten by the
 * spin's own transform and drift.
 */
function Spinner({ size = "default", className, ...props }: SpinnerProps) {
  return (
    <span role="status" aria-label="Loading" className={cn("inline-flex shrink-0 text-muted-foreground", className)} {...props}>
      <LoaderCircle aria-hidden className={cn("animate-spin", sizes[size])} />
    </span>
  );
}

export { Spinner };
