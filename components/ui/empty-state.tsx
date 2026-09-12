import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** A lucide icon component (`icon={Inbox}`) or an already-rendered element. */
  icon?: LucideIcon | React.ReactElement;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Primary call to action, usually a <Button>. */
  action?: React.ReactNode;
}

/**
 * Illustration-free empty state used by every list page. Centered, quiet,
 * with a single CTA so the next step is obvious.
 */
function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  let iconNode: React.ReactNode = null;
  if (icon) {
    if (React.isValidElement(icon)) {
      iconNode = icon;
    } else {
      const Icon = icon;
      iconNode = <Icon className="h-5 w-5" strokeWidth={1.75} />;
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
      {...props}
    >
      {iconNode ? (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border bg-background text-foreground shadow-card">
          {iconNode}
        </div>
      ) : null}
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
