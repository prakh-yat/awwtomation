import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const sizes = {
  sm: "h-3.5 w-3.5",
  default: "h-5 w-5",
  lg: "h-8 w-8",
} as const;

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: keyof typeof sizes;
}

function Spinner({ size = "default", className, ...props }: SpinnerProps) {
  return (
    <LoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-muted-foreground", sizes[size], className)}
      {...props}
    />
  );
}

export { Spinner };
