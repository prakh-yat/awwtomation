import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm leading-relaxed transition-[border-color,box-shadow]",
        "hover:border-ink/30",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/15",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
